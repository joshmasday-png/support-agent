import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: a store owner requested deletion of a customer's data. If you
  // store any data for the customer in `payload`, delete it here.

  return new Response();
};
