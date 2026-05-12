import type { SQLiteDatabase } from 'expo-sqlite';

import type {
  PromotionListItem,
  PromotionStatus,
  PromotionType,
} from './types';

export type PromotionFormInput = {
  name: string;
  promoType: PromotionType;
  status: PromotionStatus;
  productId?: number | null;
  categoryId?: number | null;
  discountValue: number;
  startsAt?: string | null;
  endsAt?: string | null;
  ruleJson?: string | null;
  userId: number;
};

function cleanRuleJson(value?: string | null) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  try {
    JSON.parse(trimmed);
    return trimmed;
  } catch {
    throw new Error('Rule JSON must be valid JSON.');
  }
}

function validatePromotion(input: PromotionFormInput) {
  if (!input.name.trim()) {
    throw new Error('Promotion name is required.');
  }

  if (input.discountValue < 0) {
    throw new Error('Discount value cannot be negative.');
  }

  if (!input.productId && !input.categoryId && input.promoType !== 'fixed_discount') {
    throw new Error('Select a product or category for this promotion.');
  }
}

export async function getPromotions(db: SQLiteDatabase) {
  return db.getAllAsync<PromotionListItem>(
    `SELECT
       promotions.id,
       promotions.name,
       promotions.promo_type,
       promotions.status,
       promotions.product_id,
       products.name as product_name,
       promotions.category_id,
       categories.name as category_name,
       promotions.discount_value,
       promotions.starts_at,
       promotions.ends_at,
       promotions.rule_json,
       promotions.created_at
     FROM promotions
     LEFT JOIN products ON products.id = promotions.product_id
     LEFT JOIN categories ON categories.id = promotions.category_id
     ORDER BY
       CASE promotions.status
         WHEN 'active' THEN 1
         WHEN 'scheduled' THEN 2
         ELSE 3
       END,
       promotions.created_at DESC`
  );
}

export async function createPromotion(db: SQLiteDatabase, input: PromotionFormInput) {
  validatePromotion(input);

  let promotionId = 0;
  const ruleJson = cleanRuleJson(input.ruleJson);

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO promotions
        (name, promo_type, status, product_id, category_id, discount_value, starts_at, ends_at, rule_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      input.name.trim(),
      input.promoType,
      input.status,
      input.productId ?? null,
      input.categoryId ?? null,
      input.discountValue,
      input.startsAt?.trim() || null,
      input.endsAt?.trim() || null,
      ruleJson
    );

    promotionId = result.lastInsertRowId;

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'promotion_created',
      'promotion',
      promotionId,
      JSON.stringify({ name: input.name.trim(), status: input.status, promoType: input.promoType })
    );
  });

  return promotionId;
}

export async function updatePromotion(
  db: SQLiteDatabase,
  promotionId: number,
  input: PromotionFormInput
) {
  validatePromotion(input);

  const ruleJson = cleanRuleJson(input.ruleJson);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE promotions
       SET name = ?,
           promo_type = ?,
           status = ?,
           product_id = ?,
           category_id = ?,
           discount_value = ?,
           starts_at = ?,
           ends_at = ?,
           rule_json = ?
       WHERE id = ?`,
      input.name.trim(),
      input.promoType,
      input.status,
      input.productId ?? null,
      input.categoryId ?? null,
      input.discountValue,
      input.startsAt?.trim() || null,
      input.endsAt?.trim() || null,
      ruleJson,
      promotionId
    );

    await db.runAsync(
      `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, metadata_json)
       VALUES (?, ?, ?, ?, ?)`,
      input.userId,
      'promotion_updated',
      'promotion',
      promotionId,
      JSON.stringify({ name: input.name.trim(), status: input.status, promoType: input.promoType })
    );
  });
}
