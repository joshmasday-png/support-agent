import { redirect } from "@remix-run/node";
import { useSubmit } from "@remix-run/react";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  Box,
} from "@shopify/polaris";
import { TitleBar } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";

// Shopify redirects here (the returnUrl) after the merchant approves or
// declines the subscription on the billing approval screen.
export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const { hasActivePayment } = await billing.check({
    plans: ["Basic Plan"],
    isTest: false,
  });

  // Approved: the subscription is now active, send them into the app.
  if (hasActivePayment) {
    return redirect("/app");
  }

  // Declined (or not yet subscribed): fall through to render the gate screen.
  return null;
};

// Triggered by the "Activate Basic Plan" button to restart the approval flow.
export const action = async ({ request }) => {
  const { billing } = await authenticate.admin(request);
  const url = new URL(request.url);

  await billing.request({
    plan: "Basic Plan",
    isTest: false,
    returnUrl: `${url.origin}/app/billing`,
  });

  return null;
};

export default function Billing() {
  const submit = useSubmit();
  const activate = () => submit({}, { method: "POST" });

  return (
    <Page>
      <TitleBar title="Subscription required" />
      <Card>
        <BlockStack gap="400">
          <Text as="h2" variant="headingMd">
            A subscription is required
          </Text>
          <Text as="p" variant="bodyMd">
            Zypher needs an active Basic Plan subscription ($19/month) to run.
            Your subscription wasn’t activated, so the app is currently locked.
            Activate the plan to start using Zypher.
          </Text>
          <Box>
            <Button variant="primary" onClick={activate}>
              Activate Basic Plan
            </Button>
          </Box>
        </BlockStack>
      </Card>
    </Page>
  );
}
