import React from 'react';
import ReactDOM from 'react-dom';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';

import App from './App';
import './index.css'; // Opcional: estilo general de tu app

require('@solana/wallet-adapter-react-ui/styles.css'); // Estilos de los componentes del Wallet Adapter

const wallets = [];

ReactDOM.render(
  <React.StrictMode>
    <ConnectionProvider endpoint="https://api.devnet.solana.com">
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>
          <App />
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  </React.StrictMode>,
  document.getElementById('root')
);
