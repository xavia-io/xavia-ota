import { Head, Html, Main, NextScript } from 'next/document';

const title = 'OTA updates · item7go';
const description = 'Publish, track and roll back over-the-air updates for item7go apps.';

export default function Document() {
  // Link previews (WhatsApp, Slack, iMessage) only load absolute image URLs.
  const imageUrl = `${(process.env.HOST ?? '').replace(/\/+$/, '')}/og-image.png`;

  return (
    <Html lang="en">
      <Head>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#0B0B0D" />
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" href="/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="item7go" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={imageUrl} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="GO logo with the words OTA updates" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={imageUrl} />
      </Head>
      <body>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
