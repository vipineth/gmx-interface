import React from "react";
import ReactDOM from "react-dom";
import "regenerator-runtime/runtime";
import { BrowserRouter as Router } from "react-router-dom";
import App from "./App/App";
import reportWebVitals from "./reportWebVitals";
import { EthereumClient, w3mConnectors } from "@web3modal/ethereum";
import { Web3Modal } from "@web3modal/react";
import { configureChains, createClient, WagmiConfig } from "wagmi";
import { arbitrum, avalanche, avalancheFuji, arbitrumGoerli, mainnet } from "wagmi/chains";
import { publicProvider } from "wagmi/providers/public";

const projectId = "de24cddbaf2a68f027eae30d9bb5df58";

const chains = [mainnet, arbitrum, avalanche, avalancheFuji, arbitrumGoerli];
const { provider } = configureChains(chains, [publicProvider()]);
const wagmiClient = createClient({
  autoConnect: true,
  connectors: w3mConnectors({ version: 1, chains, projectId }),
  provider,
});

const ethereumClient = new EthereumClient(wagmiClient, chains);

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <WagmiConfig client={wagmiClient}>
        <App />
      </WagmiConfig>
      <Web3Modal projectId={projectId} ethereumClient={ethereumClient} />
    </Router>
  </React.StrictMode>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.info))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
