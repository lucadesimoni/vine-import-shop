import { Outlet } from "react-router";
import { Footer, Header, Toast } from "~/components/shop";
import { useI18n } from "~/lib/i18n";
import { useRootData } from "~/lib/root-data";

export default function ShopLayout() {
  const { toast } = useRootData();
  const { t } = useI18n();
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-fg focus:px-4 focus:py-2 focus:text-bg">{t("nav.skip")}</a>
      <Header />
      <main id="main" className="min-h-[60vh]">
        <Outlet />
      </main>
      <Footer />
      {toast && <Toast>{toast.text}</Toast>}
    </>
  );
}
