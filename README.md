# 🌌 Pulsar DAO

![Pulsar DAO Banner](img/pulsar_dao_banner.png)

> **Next-Generation Hybrid Governance on Solana.**
> combining Liquid Democracy with Time-Locked Staking incentives.

![Solana](https://img.shields.io/badge/Solana-Devnet-linear?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-Framework-blue?style=for-the-badge&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🚀 Overview

**Pulsar DAO** is a cutting-edge governance protocol designed to solve the "voter apathy" and "whale dominance" problems in traditional DAOs. By implementing a **Hybrid Voting Mechanism**, Pulsar DAO allows users to vote with both their liquid token holdings and locked stakes, rewarding long-term commitment.

The system features a futuristic, responsive UI connected to a robust Solana smart contract, ensuring a seamless and transparent user experience.

---

## ✨ Key Features

### 🔮 Hybrid Voting Power & Proposal Limits
Your voting influence is dynamically calculated based on two factors:
1.  **Liquid Balance:** Tokens held in your wallet provide baseline power.
2.  **Staked Balance:** Tokens locked in the DAO Vault provide boosted power.

**Formula:**
$$ \text{Voting Power} = \sqrt{\text{Liquid Tokens}} + (\sqrt{\text{Staked Tokens}} \times \text{Time Multiplier}) $$

> **Note:** Proposals have a strictly enforced **Deadline**. Once the deadline timestamp is passed (checked on-chain via `Clock::get()`), no further votes can be cast or withdrawn.

### 🔐 Global Staking
- **Unified Stake Record:** A single staking account per user simplifies management.
- **Time-Lock Multipliers:** Earn more governance power by locking tokens for longer periods.
    - **30 Days:** 1x Multiplier
    - **60 Days:** 2x Multiplier
    - **90 Days:** 3x Multiplier
    - **180 Days:** 4x Multiplier
    - **365 Days:** 5x Max Multiplier
- **Security:** Strict on-chain validation prevents unstaking before lock expiry.

### ⏳ Time-Limited Proposals
Every proposal is created with a specific, immutable deadline to ensure timely governance decisions.
- **Custom Duration:** Proposal creators define the voting window (e.g., 24 hours, 7 days).
- **Automatic Expiry:** Smart contracts rigidly enforce the deadline using the on-chain `Clock`. Once time is up, no new votes or withdrawals are accepted.

### ⚡ Advanced Vote Management
- **Switch Vote:** specific support allows users to change their opinion (e.g., YES → NO) dynamically while the proposal is active.
- **Withdraw Vote:** Users can retract their vote entirely to reclaim their governance weight or correct mistakes.

### 🛡️ Circuit Breaker (Safety Module)
An admin-controlled "Emergency Stop" system. If a critical vulnerability is detected, the **Circuit Breaker** can be tripped to instantly pause all voting and withdrawal actions, protecting DAO assets.

---

## 🏗️ Technical Architecture

### Smart Contract (Solana / Anchor)
- **Framework:** Anchor 0.30.1
- **Storage:** Account-based (Global State, Proposal Account, Voter Record, Stake Record).

### Frontend (React / Web3)
- **Styling:** Custom "Cyberpunk/Neon" aesthetic using TailwindCSS + `lucide-react` icons.
- **Interaction:** Uses `@solana/wallet-adapter-react` for seamless wallet connection.
- **Integration:** Direct RPC communication via automatically generated IDL.

### Governance Flow
1.  **User connects wallet.**
2.  **Optional:** User deposits tokens into **Stake Vault** to gain Multiplier (up to 5x).
3.  **User selects Proposal.**
    *   System calculates `Total Voting Power = Liquid + Staked`.
4.  **Cast Vote (YES/NO).**
    *   On-chain: `VoterRecord` created/updated.
    *   On-chain: `ProposalAccount` vote counters updated.
5.  **Result:** Vote is finalized when Proposal Deadline expires.

---

## 🛠️ Developer Guide

### Prerequisites
- **Node.js** (v18+) & **Yarn**
- **Rust** & **Cargo**
- **Solana Tool Suite** (v1.16+)
- **Anchor AVM** (v0.30.1)

### Installation

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/yourusername/pulsar-dao.git
    cd pulsar-dao
    ```

2.  **Install dependencies:**
    ```bash
    yarn install
    ```

3.  **Build the Smart Contract:**
    ```bash
    anchor build
    ```

### ✅ Comprehensive Testing

We maintain a rigorous test suite (`tests/pulsar_dao.ts`) that verifies 12 critical scenarios to ensure system integrity:

*   **Global State:** Verifies correct initialization of the DAO parameters.
*   **Staking Logic:**
    *   Tests token deposits.
    *   Validates Time-Lock Multiplier logic (e.g., 30 days = 2x).
    *   Ensures `Unstake` fails if tokens are still locked (Security check).
*   **Hybrid Voting:**
    *   Calculates expected voting power combining Liquid + Staked math.
    *   Verifies vote weights are applied correcty to "YES" or "NO" buckets.
*   **User Freedom:**
    *   **Switch Vote:** Tests changing a vote from YES to NO.
    *   **Withdraw Vote:** Tests retracting a vote completely.
*   **Circuit Breaker:**
    *   Simulates Admin disabling the system.
    *   Verifies Users are blocked from voting.
    *   Simulates System restoration.

**Run the full suite:**
```bash
anchor test
```

### Local Development

1.  **Start Frontend:**
    ```bash
    cd app
    yarn start
    ```
    Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 📦 Deployment

To deploy updates:
1.  Ensure you have SOL in your deployer wallet.
2.  Run:
    ```bash
    anchor deploy --provider.cluster devnet
    ```
3.  Copy the new IDL to the frontend:
    ```bash
    cp target/idl/pulsar_dao.json app/src/idl/pulsar_dao.json
    ```

---

**Built with ❤️ by GushALKDev**
