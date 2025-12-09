const { Connection } = require('@solana/web3.js');

const connection = new Connection('https://api.devnet.solana.com');

(async () => {
    try {
        const genesisHash = await connection.getGenesisHash();
        console.log('Devnet Genesis Hash:', genesisHash);
    } catch (e) {
        console.error(e);
    }
})();
