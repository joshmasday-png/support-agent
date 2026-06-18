import { Link, Outlet, useLoaderData, useRouteError } from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import { authenticate } from "../shopify.server";

export const links = () => [{ rel: "stylesheet", href: polarisStyles }];

export const loader = async ({ request }) => {
  const { billing } = await authenticate.admin(request);

  // Gate every embedded route behind an active Basic Plan subscription.
  // Skip the billing page itself, otherwise a merchant who declined would be
  // redirected straight back to the approval screen and never see it.
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/app/billing")) {
    const { hasActivePayment } = await billing.check({
      plans: ["Basic Plan"],
      isTest: false,
    });

    if (!hasActivePayment) {
      await billing.request({
        plan: "Basic Plan",
        isTest: false,
        returnUrl: `${url.origin}/app/billing`,
      });
    }
  }

  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/additional">Additional page</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

// Shopify needs Remix to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
