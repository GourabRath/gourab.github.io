import "./globals.css";

export const metadata = {
  title: "MediCare Health | Connected care",
  description:
    "Manage appointments and connect with your care team through the MediCare patient and provider portal.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-scroll-behavior="smooth" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
