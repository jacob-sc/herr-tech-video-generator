import { Html, Head, Main, NextScript } from 'next/document';

export default function Document() {
  return (
    <Html lang="de">
      <Head>
        <meta name="theme-color" content="#000000" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Red+Hat+Display:wght@400;500;600;700;800;900&family=Red+Hat+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </Head>
      <body style={{ margin: 0, background: '#000000' }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
