import type { CartItemSnapshot, PromotionListItem } from '@/lib/database/types';

type RuleJson = {
  buyQty?: number;
  freeQty?: number;
  minimumSpend?: number;
  startTime?: string;
  endTime?: string;
};

export type PromotionDiscount = {
  productId: number;
  discountAmount: number;
  promotionId: number | null;
  promotionName: string | null;
};

function roundCurrency(value: number) {
  return Math.round(value * 100) / 100;
}

function parseRuleJson(value: string | null): RuleJson {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function minutesFromTime(value: string) {
  const [hours, minutes] = value.split(':').map(Number);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }

  return hours * 60 + minutes;
}

function isTimeRuleActive(rule: RuleJson, now: Date) {
  if (!rule.startTime || !rule.endTime) {
    return true;
  }

  const start = minutesFromTime(rule.startTime);
  const end = minutesFromTime(rule.endTime);

  if (start == null || end == null) {
    return true;
  }

  const current = now.getHours() * 60 + now.getMinutes();

  return start <= end
    ? current >= start && current <= end
    : current >= start || current <= end;
}

function isPromotionActive(promotion: PromotionListItem, now: Date) {
  if (promotion.status !== 'active') {
    return false;
  }

  const startsAt = promotion.starts_at ? new Date(promotion.starts_at.replace(' ', 'T')) : null;
  const endsAt = promotion.ends_at ? new Date(promotion.ends_at.replace(' ', 'T')) : null;

  if (startsAt && Number.isFinite(startsAt.getTime()) && now < startsAt) {
    return false;
  }

  if (endsAt && Number.isFinite(endsAt.getTime()) && now > endsAt) {
    return false;
  }

  return isTimeRuleActive(parseRuleJson(promotion.rule_json), now);
}

function linePromotionDiscount(item: CartItemSnapshot, promotion: PromotionListItem) {
  const lineSubtotal = item.quantity * item.unitPrice;

  if (promotion.promo_type === 'percentage_discount' || promotion.promo_type === 'time_discount') {
    return roundCurrency(lineSubtotal * (promotion.discount_value / 100));
  }

  if (promotion.promo_type === 'fixed_discount') {
    return roundCurrency(Math.min(lineSubtotal, promotion.discount_value));
  }

  if (promotion.promo_type === 'bundle') {
    const rule = parseRuleJson(promotion.rule_json);
    const buyQty = Math.max(1, Number(rule.buyQty ?? 1));
    const freeQty = Math.max(1, Number(rule.freeQty ?? 1));
    const groupSize = buyQty + freeQty;
    const freeUnits = Math.floor(item.quantity / groupSize) * freeQty;

    return roundCurrency(Math.min(lineSubtotal, freeUnits * item.unitPrice));
  }

  return 0;
}

function matchesLinePromotion(item: CartItemSnapshot, promotion: PromotionListItem) {
  if (promotion.product_id) {
    return promotion.product_id === item.productId;
  }

  if (promotion.category_id) {
    return promotion.category_id === item.categoryId;
  }

  return false;
}

export function calculatePromotionDiscounts(
  items: CartItemSnapshot[],
  promotions: PromotionListItem[],
  now = new Date()
): PromotionDiscount[] {
  const activePromotions = promotions.filter((promotion) => isPromotionActive(promotion, now));
  const discounts = items.map((item) => {
    const best = activePromotions
      .filter((promotion) => matchesLinePromotion(item, promotion))
      .map((promotion) => ({
        promotion,
        discountAmount: linePromotionDiscount(item, promotion),
      }))
      .sort((a, b) => b.discountAmount - a.discountAmount)[0];

    return {
      productId: item.productId,
      discountAmount: best?.discountAmount ?? 0,
      promotionId: best?.discountAmount ? best.promotion.id : null,
      promotionName: best?.discountAmount ? best.promotion.name : null,
    };
  });

  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const basketPromotions = activePromotions
    .filter((promotion) => !promotion.product_id && !promotion.category_id)
    .filter((promotion) => promotion.promo_type === 'fixed_discount')
    .filter((promotion) => {
      const rule = parseRuleJson(promotion.rule_json);
      return subtotal >= Number(rule.minimumSpend ?? 0);
    })
    .sort((a, b) => b.discount_value - a.discount_value);
  const basketPromotion = basketPromotions[0];

  if (basketPromotion && subtotal > 0) {
    let remaining = Math.min(
      basketPromotion.discount_value,
      subtotal - discounts.reduce((sum, discount) => sum + discount.discountAmount, 0)
    );

    return discounts.map((discount, index) => {
      if (remaining <= 0) {
        return discount;
      }

      const item = items[index];
      const lineSubtotal = item.quantity * item.unitPrice;
      const availableLineAmount = Math.max(0, lineSubtotal - discount.discountAmount);
      const lineShare =
        index === discounts.length - 1
          ? remaining
          : roundCurrency((lineSubtotal / subtotal) * basketPromotion.discount_value);
      const allocated = roundCurrency(Math.min(remaining, availableLineAmount, lineShare));
      remaining = roundCurrency(remaining - allocated);

      return {
        productId: discount.productId,
        discountAmount: roundCurrency(discount.discountAmount + allocated),
        promotionId: allocated > 0 ? basketPromotion.id : discount.promotionId,
        promotionName: allocated > 0 ? basketPromotion.name : discount.promotionName,
      };
    });
  }

  return discounts;
}
