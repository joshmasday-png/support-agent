import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: a store owner requested a customer's data. If you store any
  // customer data, gather it and deliver it to the store owner here.
  // `payload` contains the customer and requested order ids.

  return new Response();
};
