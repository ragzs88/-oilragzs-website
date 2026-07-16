const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const DROP_SHIPPER_EMAIL = 'Woodlandtransfers@sasktel.net';

module.exports.config = {
  api: {
    bodyParser: false,
  },
};

function buffer(readable) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    readable.on('data', (chunk) => chunks.push(chunk));
    readable.on('end', () => resolve(Buffer.concat(chunks)));
    readable.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).send('Method not allowed');
  }

  const sig = req.headers['stripe-signature'];
  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send('Webhook Error: ' + err.message);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    try {
      const lineItems = await stripe.checkout.sessions.listLineItems(
        session.id,
        { limit: 100 }
      );

      const shipping = session.shipping_details || session.customer_details;
      const address = shipping && shipping.address ? shipping.address : {};

      const itemsHtml = lineItems.data
        .map((item) => {
          const amount = (item.amount_total / 100).toFixed(2);
          return '<li>' + item.quantity + ' x ' + item.description + ' - $' + amount + ' ' + session.currency.toUpperCase() + '</li>';
        })
        .join('');

      const totalAmount = (session.amount_total / 100).toFixed(2);

      const emailHtml =
        '<h2>New Oil Ragzs Order</h2>' +
        '<p><strong>Order/Session ID:</strong> ' + session.id + '</p>' +
        '<p><strong>Customer:</strong> ' + (shipping ? shipping.name : '') + ' (' + (session.customer_details ? session.customer_details.email : '') + ')</p>' +
        '<p><strong>Shipping Address:</strong><br>' +
        (address.line1 || '') + '<br>' +
        (address.line2 ? address.line2 + '<br>' : '') +
        (address.city || '') + ', ' + (address.state || '') + ' ' + (address.postal_code || '') + '<br>' +
        (address.country || '') +
        '</p>' +
        '<h3>Items</h3>' +
        '<ul>' + itemsHtml + '</ul>' +
        '<p><strong>Total:</strong> $' + totalAmount + ' ' + session.currency.toUpperCase() + '</p>';

      await resend.emails.send({
        from: 'orders@oilragzs.com',
        to: DROP_SHIPPER_EMAIL,
        subject: 'New Order - ' + session.id,
        html: emailHtml,
      });
    } catch (err) {
      console.error('Error processing order / sending email:', err);
    }
  }

  return res.status(200).json({ received: true });
};
