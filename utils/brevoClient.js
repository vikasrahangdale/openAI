const SibApiV3Sdk = require("@sendinblue/client");

const brevoClient = new SibApiV3Sdk.TransactionalEmailsApi();

brevoClient.setApiKey(
  SibApiV3Sdk.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY
);

module.exports = brevoClient;
