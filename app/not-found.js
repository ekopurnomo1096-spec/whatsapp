import NotFoundView from "./NotFoundView";

export const metadata = {
  title: "EMAHAIRSHOP | Halaman tidak ditemukan",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <NotFoundView />;
}
