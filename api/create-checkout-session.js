const Stripe = require('stripe');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const domain = process.env.YOUR_DOMAIN;
    const items = req.body.items || [];

    if (items.length === 0) {
      res.status(400).json({ error: 'Cart is empty' });
      return;
    }

    const line_items = items.map((item) => ({
      price_data: {
        currency: 'cad',
        product_data: {
          name: item.size ? `${item.name} (${item.size})` : item.name,
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.qty,
    }));

    line_items.push({
      price_data: {
        currency: 'cad',
        product_data: {
          name: 'Shipping',
        },
        unit_amount: 1299,
      },
      quantity: 1,
    });

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: line_items,
      mode: 'payment',
      success_url: `${domain}/success.html`,
      cancel_url: `${domain}/cancel.html`,
      shipping_address_collection: {
        allowed_countries: ['CA', 'US'],
      },
    });

    res.status(200).json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

