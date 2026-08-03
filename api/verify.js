/**
 * /api/verify
 *
 * ブラウザから送られてきたアクセスコード(Gumroadのライセンスキー)を
 * Gumroad側に照会し、有効であれば復号鍵(DECRYPT_KEY)を返す。
 *
 * 必要な環境変数(Vercelのプロジェクト設定 > Environment Variables で設定):
 *   GUMROAD_PRODUCT_ID … Gumroadの商品ページで確認できるproduct_id
 *   DECRYPT_KEY         … build-encrypt.js が出力したbase64の復号鍵
 *   MAX_USES            … (任意) 1つのコードにつき許可する確認回数の上限。未設定なら無制限。
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, message: 'Method not allowed' });
    return;
  }

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') {
    res.status(400).json({ ok: false, message: 'アクセスコードを入力してください。' });
    return;
  }

  const productId = process.env.GUMROAD_PRODUCT_ID;
  const decryptKey = process.env.DECRYPT_KEY;
  const maxUses = process.env.MAX_USES ? parseInt(process.env.MAX_USES, 10) : null;

  if (!productId || !decryptKey) {
    res.status(500).json({ ok: false, message: 'サーバー側の設定が未完了です（管理者向け: 環境変数を確認してください）。' });
    return;
  }

  try {
    const params = new URLSearchParams();
    params.append('product_id', productId);
    params.append('license_key', code.trim());
    params.append('increment_uses_count', 'true');

    const gumroadRes = await fetch('https://api.gumroad.com/v2/licenses/verify', {
      method: 'POST',
      body: params
    });
    const data = await gumroadRes.json();

    if (!gumroadRes.ok || !data.success) {
      res.status(200).json({ ok: false, message: 'アクセスコードが確認できませんでした。入力内容をご確認ください。' });
      return;
    }

    if (data.purchase && data.purchase.refunded) {
      res.status(200).json({ ok: false, message: 'このアクセスコードに対応する購入は返金されています。' });
      return;
    }
    if (data.purchase && data.purchase.disputed) {
      res.status(200).json({ ok: false, message: 'このアクセスコードに対応する購入は係争中です。' });
      return;
    }

    if (maxUses && typeof data.uses === 'number' && data.uses > maxUses) {
      res.status(200).json({ ok: false, message: 'このアクセスコードは利用上限に達しています。' });
      return;
    }

    res.status(200).json({ ok: true, key: decryptKey });
  } catch (err) {
    res.status(500).json({ ok: false, message: '確認処理中にエラーが発生しました。時間をおいて再度お試しください。' });
  }
}
