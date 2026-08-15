const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const buf = await buffer(req);
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const fullSession = await stripe.checkout.sessions.retrieve(session.id, {
        expand: ['line_items', 'customer_details']
      });

      const items = fullSession.line_items.data.map(item => {
        return item.description + ' x' + item.quantity + ' - $' + (item.amount_total / 100).toFixed(2);
      }).join('\n');

      const customerName = fullSession.customer_details.name || 'N/A';
      const customerEmail = fullSession.customer_details.email || 'N/A';
      const shippingName = fullSession.shipping_details ? fullSession.shipping_details.name : customerName;
      const address = fullSession.shipping_details && fullSession.shipping_details.address
        ? [
            fullSession.shipping_details.address.line1,
            fullSession.shipping_details.address.line2,
            fullSession.shipping_details.address.city,
            fullSession.shipping_details.address.state,
            fullSession.shipping_details.address.postal_code,
            fullSession.shipping_details.address.country
          ].filter(Boolean).join(', ')
        : 'N/A';

      let shippingOptionName = 'N/A';
      if (fullSession.shipping_cost && fullSession.shipping_cost.shipping_rate) {
        const rate = await stripe.shippingRates.retrieve(fullSession.shipping_cost.shipping_rate);
        shippingOptionName = rate.display_name;
      }

      const isPickup = shippingOptionName.toLowerCase().includes('pickup');

      const total = (fullSession.amount_total / 100).toFixed(2);

      let emailBody = 'New Oil Ragzs Order\n\n';
      emailBody += 'Customer: ' + customerName + '\n';
      emailBody += 'Email: ' + customerEmail + '\n';
      emailBody += 'Delivery Method: ' + shippingOptionName + '\n\n';

      if (isPickup) {
        emailBody += 'CUSTOMER SELECTED LOCAL PICKUP\n';
        emailBody += 'No shipping needed. Please email the customer at ' + customerEmail + ' to arrange pickup address and time.\n\n';
      } else {
        emailBody += 'Shipping Address: ' + address + '\n';
        emailBody += 'Shipping Name: ' + shippingName + '\n\n';
      }

      emailBody += 'Items:\n' + items + '\n\n';
      emailBody += 'Total: $' + total + ' CAD';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + process.env.RESEND_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'orders@oilragzs.com',
          to: 'Woodlandtransfers@sasktel.net',
          subject: 'New Oil Ragzs Order' + (isPickup ? ' - LOCAL PICKUP' : ''),
          text: emailBody
        })
      });

      res.status(200).json({ received: true });
    } catch (err) {
      console.error('Error processing order', err);
      res.status(200).json({ received: true });
    }
  } else {
    res.status(200).json({ received: true });
  }
};

function buffer(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports.config = {
  api: {
    bodyParser: false
  }
};

