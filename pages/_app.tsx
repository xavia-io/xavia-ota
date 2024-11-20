import { AppProps } from 'next/app';
import Providers from './ChakraProvider';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <Providers>
      <Component {...pageProps} />
    </Providers>
  );
}

export default MyApp;
