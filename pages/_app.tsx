import App, { AppContext, AppProps } from 'next/app';
import Head from 'next/head';
import Providers from './ChakraProvider';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>OTA updates · item7go</title>
      </Head>
      <Providers>
        <Component {...pageProps} />
      </Providers>
    </>
  );
}

// Renders every page per request instead of at build time, so _document reads the
// runtime HOST for the absolute preview image URL (HOST is not set during docker build).
MyApp.getInitialProps = (context: AppContext) => App.getInitialProps(context);

export default MyApp;
