import { authenticate } from "../shopify.server";

export const action = async ({ request }) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // GDPR: 48 hours after a store uninstalls your app, Shopify sends this
  // to request deletion of that shop's data. Delete any data you store
  // for `shop` here.

  return new Response();
};
