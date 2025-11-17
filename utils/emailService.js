const brevo = require("./brevoClient");
const Email = require("../models/Email");

async function sendRequestEmail(to) {
  await brevo.sendTransacEmail({
    sender: { email: process.env.MY_EMAIL, name: "Supplier Bot" },
    to: [{ email: to }],
    subject: "Do you want product details?",
    htmlContent:
      "<p>Namaste 🙏<br/>Agar aapko hamare products ki details chahiye to is email ka reply <b>YES</b> likh kar karein.</p>",
  });

  await Email.updateOne(
    { email: to },
    {
      status: "request_sent",
      lastMailTime: new Date(),
    }
  );
}

async function sendProductDetails(to) {
  await brevo.sendTransacEmail({
    sender: { email: process.env.MY_EMAIL, name: "Supplier Bot" },
    to: [{ email: to }],
    subject: "Your Product Details",
    htmlContent: `
      <h2>Product Details</h2>
      <p>Yahan tum apna products ka HTML likh sakte ho:</p>
      <ul>
        <li>Product 1 - Details</li>
        <li>Product 2 - Details</li>
        <li>Product 3 - Details</li>
      </ul>
      <p>Dhanyawaad! 😊</p>
    `,
  });

  await Email.updateOne(
    { email: to },
    {
      status: "details_sent",
      lastMailTime: new Date(),
    }
  );
}

module.exports = {
  sendRequestEmail,
  sendProductDetails,
};
