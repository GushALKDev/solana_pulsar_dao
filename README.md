# 🌌 Pulsar DAO

![Pulsar DAO Banner](img/pulsar_dao_banner.png)

> **Next-Generation Hybrid Governance on Solana.**  
> Combining Liquid Democracy with Time-Locked Staking incentives and **Proxy Lock** security.

![Solana](https://img.shields.io/badge/Solana-Devnet-linear?style=for-the-badge&logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-Framework-blue?style=for-the-badge&logo=rust&logoColor=white)
![React](https://img.shields.io/badge/Frontend-React-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

---

## 🚀 Overview

**Pulsar DAO** is a cutting-edge governance protocol designed to solve the "voter apathy" and "whale dominance" problems in traditional DAOs. By implementing a **Hybrid Voting Mechanism**, Pulsar DAO allows users to vote with both their liquid token holdings and locked stakes, rewarding long-term commitment.

Governance is powered by **$PULSAR**, the native token used for voting, staking, and delegation.

### 🎯 Core Innovation: Proxy Lock

**Proxy Vote Lock** is a novel security primitive that prevents retroactive vote manipulation:
- Once a delegate votes on your behalf, **you cannot withdraw or change that vote**
- Lock persists even after revoking delegation
- Ensures governance integrity and prevents vote manipulation

### 🪙 $PULSAR Token & Faucet

**$PULSAR** is the native governance token of Pulsar DAO. It's used for:
- **Voting:** Cast votes on proposals with quadratic power calculation
- **Staking:** Lock tokens to earn time-based multipliers (up to 5x)
- **Delegation:** Transfer voting power to trusted delegates

#### Token Faucet (Testnet)
To facilitate testing and hackathon participation, we provide a **free token faucet**:
- **Amount:** 3,000 $PULSAR per request
- **Cooldown:** 24 hours between requests per wallet
- **Access:** Available via the **Faucet** button in the app header

This allows anyone to participate in governance without needing to acquire tokens externally.

---

## ✨ Key Features

### 🔮 Hybrid & Quadratic Voting
Pulsar DAO combines **Liquid Democracy** with **Quadratic Voting** to create a fair and resilient governance model.

#### 1. Quadratic Voting (The "Fairness" Engine)
To prevent "whale dominance" (where 1 wealthy user outvotes everyone), we calculate voting power using the **Square Root** of token holdings.
- **Concept:** Voting power increases quadratically slower than token holding.
- **The Math:** `Voting Power = √Tokens`
- **Example:**
    - Holder A has **100 Tokens** → Gets **10 Votes**.
    - Holder B has **10,000 Tokens** → Gets **100 Votes**.
- **Impact:** To have **10x** the influence, a user needs **100x** the tokens. This balances the playing field between large stakeholders and the broader community.

#### 2. Hybrid Strategy
Your total influence is a dynamic sum of two sources:
- **Liquid Balance:** Tokens held in your wallet (Example: 100 tokens = 10 power).
- **Staked Balance:** Tokens locked in the DAO Vault, which receive a **Time Multiplier** bonus.

**Master Formula:**  
`Voting Power = √Liquid_Tokens + (√Staked_Tokens × Time_Multiplier)`

---

### 🔐 Global Staking
- **Unified Stake Record:** A single staking account per user simplifies management.
- **Time-Lock Multipliers:** Earn more governance power by locking tokens for longer periods.
    *Note: For testing/hackathon purposes, these are currently set to seconds.*
    - **30 Seconds:** 2x Multiplier (Base)
    - **90 Seconds:** 3x Multiplier
    - **180 Seconds:** 4x Multiplier
    - **360 Seconds:** 5x Max Multiplier
- **Security:** Strict on-chain validation prevents unstaking before lock expiry.

---

### 💧 Liquid Delegation
A powerful yet secure delegation system allowing users to trust experts with their governance power.

#### Security Features
- **1-Hop Delegation:** Strictly enforces direct delegation (A → B). Chain delegation (A → B → C) is blocked to prevent centralization loops.
- **Exclusive Voting:** Delegators forfeit their right to vote directly while delegation is active.
- **Self-Delegation Prevention:** Cannot delegate to yourself.
- **Cycle Detection:** Delegates cannot become delegators.

#### Proxy Lock (Novel Security Primitive)
If your Delegate casts a vote on your behalf, that vote is **LOCKED** for the duration of the proposal:
- **Immutable:** Even if you revoke delegation, you cannot withdraw or change that specific vote.
- **Prevents Manipulation:** Ensures votes cast by trusted delegates remain intact.
- **Unique to Pulsar DAO:** A novel governance primitive not found in other DAOs.

#### User Experience
- **Batch Processing:** Delegates can cast or withdraw votes for all their delegators in a single, gas-efficient transaction.
- **Visual Indicators:** Clear UI warnings for proxy lock status and delegation state.

---

### ⏳ Time-Limited Proposals
Every proposal is created with a specific, immutable deadline to ensure timely governance decisions.
- **Custom Duration:** Proposal creators define the voting window (e.g., 24 hours, 7 days).
- **Automatic Expiry:** Smart contracts rigidly enforce the deadline using the on-chain `Clock`. Once time is up, no new votes or withdrawals are accepted.

---

### 💰 Treasury Proposals (Trustless Execution)
A novel feature allowing proposal creators to attach token transfers that execute automatically when proposals pass.

#### How It Works
1. **Create:** Author creates a proposal with attached $PULSAR tokens
2. **Escrow:** Tokens are deposited into a secure PDA escrow account
3. **Vote:** Community votes YES or NO
4. **Execute:**
   - If **YES > NO:** Anyone can trigger transfer to destination
   - If **NO ≥ YES (Tie or Defeat):** Proposal fails, Author can reclaim their tokens

#### Features
- **Trustless:** No admin intervention needed for execution
- **Configurable Timelock:** Optional grace period (in seconds) after voting ends
- **Security:** Only author can reclaim failed proposals
- **Tie Breaker:** Ties count as defeat (Status Quo bias)

---

### ⚡ Advanced Vote Management
- **Switch Vote:** Specific support allows users to change their opinion (e.g., YES → NO) dynamically while the proposal is active.
- **Withdraw Vote:** Users can retract their vote entirely to reclaim their governance weight or correct mistakes.

---

### 🔔 Smart Notifications
- **Real-Time Updates:** A bell icon alerts users to new proposals instantly.
- **Smart Tracking:** The system remembers which proposals a user has seen, showing a "New" indicator only for relevant items.
- **Auto-Read:** Viewing a proposal or clicking the notification automatically marks it as read.

---

### 📊 Analytics Dashboard
A real-time analytics hub provides deep insights into DAO activity:
- **KPIs:** Track total votes cast, active proposals, and proposal completion rates.
- **Engagement Charts:** Visual bar charts showing YES/NO vote distribution per proposal.
- **Sentiment Analysis:** Global pie chart aggregating historical voting trends.
- **Top Proposals:** Leaderboard of the most engaged proposals.

---

### 🛡️ Circuit Breaker (Safety Module)
An admin-controlled "Emergency Stop" system. If a critical vulnerability is detected, the **Circuit Breaker** can be tripped to instantly pause all voting and withdrawal actions, protecting DAO assets.

---

### 👮 Admin & Security
- **Open Access (Testing):** To facilitate community testing, **Proposal Creation is currently OPEN to all users**.
    - Originally, this was restricted to the DAO Admin, but the constraint has been lifted for the hackathon/demo phase.
- **Circuit Breaker:** Admin can pause the entire system in emergencies.

---

## 📊 Quality Metrics

### Testing
- ✅ **29/29 tests passing** on localnet
- ✅ Comprehensive delegation scenarios covered
- ✅ Proxy lock enforcement verified
- ✅ Treasury proposal lifecycle tested

### Code Quality
- ✅ **0 compilation warnings**
- ✅ Idiomatic Rust patterns (`require!()` macros)
- ✅ Clean, well-documented codebase

### User Experience
- ✅ Visual delegation status indicators
- ✅ Proxy lock warnings
- ✅ Notification system with read tracking
- ✅ Responsive, modern UI

---

## 🏗️ Technical Architecture

### Smart Contract (Solana / Anchor)
- **Framework:** Anchor 0.31.1
- **Storage:** Account-based (Global State, Proposal Account, Voter Record, Stake Record, Delegation Record, Delegate Profile).
- **Security:** Multi-layer constraint validation with PDA architecture.
- **Modular Architecture:**
  ```
  programs/pulsar_dao/src/
  ├── lib.rs          # Instruction handlers
  ├── errors.rs       # Error codes
  ├── state/mod.rs    # Account structs & Events
  └── contexts.rs     # Instruction contexts
  ```

### Frontend (React / Web3)
- **Styling:** Custom \"Cyberpunk/Neon\" aesthetic using TailwindCSS + `lucide-react` icons.
- **Interaction:** Uses `@solana/wallet-adapter-react` for seamless wallet connection.
- **Integration:** Direct RPC communication via automatically generated IDL.

### Governance Flow
1.  **User connects wallet.**
2.  **Optional:** User deposits tokens into **Stake Vault** to gain Multiplier (up to 5x).
3.  **Optional:** User delegates voting power to a trusted expert.
4.  **User selects Proposal.**
    *   System calculates `Total Voting Power = Liquid + Staked`.
5.  **Cast Vote (YES/NO)** or **Delegate votes on behalf**.
    *   On-chain: `VoterRecord` created/updated with `voted_by_proxy` flag.
    *   On-chain: `ProposalAccount` vote counters updated.
6.  **Result:** Vote is finalized when Proposal Deadline expires.

---

## 🛠️ Developer Guide

### Prerequisites
- **Node.js** (v18+) & **Yarn**
- **Rust** & **Cargo**
- **Solana Tool Suite** (v1.16+)
- **Anchor AVM** (v0.31.1)

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

We maintain a rigorous test suite (`tests/pulsar_dao.ts`) that verifies 19 critical scenarios to ensure system integrity:

*   **Global State:** Verifies correct initialization of the DAO parameters.
*   **Staking Logic:**
    *   Tests token deposits.
    *   Validates Time-Lock Multiplier logic (e.g., 30 days = 2x).
    *   Ensures `Unstake` fails if tokens are still locked (Security check).
*   **Hybrid Voting:**
    *   Calculates expected voting power combining Liquid + Staked math.
    *   Verifies vote weights are applied correctly to \"YES\" or \"NO\" buckets.
*   **User Freedom:**
    *   **Switch Vote:** Tests changing a vote from YES to NO.
    *   **Withdraw Vote:** Tests retracting a vote completely.
*   **Circuit Breaker:**
    *   Simulates Admin disabling the system.
    *   Verifies Users are blocked from voting.
    *   Simulates System restoration.
*   **Liquid Delegation:**
    *   **Registration:** Verifies Delegate Profile creation.
    *   **Delegation:** Tests secure 1-hop delegation setup.
    *   **Exclusivity:** Confirms Delegators are blocked from manual voting.
    *   **Proxy Voting:** Validates Delegates voting on behalf of others.
    *   **Proxy Lock:** Ensures proxy votes cannot be withdrawn by the delegator (Security).
*   **Treasury Proposals:**
    *   **Create with Escrow:** Verifies token transfer to PDA.
    *   **Block Early Execution:** Ensures execution fails before deadline.
    *   **Execute on YES:** Validates funds transfer to destination.
    *   **Reclaim on NO:** Tests author fund recovery.
    *   **Timelock Enforcement:** Validates grace period logic.

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

## 🎨 Technical Highlights

- **Quadratic Voting:** `sqrt(tokens)` for fair power distribution
- **Time-Lock Multipliers:** Longer stakes = more voting power
- **Hybrid Voting Power:** Liquid + Staked tokens combined
- **PDA Architecture:** Secure, deterministic account derivation
- **Proxy Lock:** Novel governance primitive preventing vote manipulation
- **Anchor Framework:** Modern Solana development with idiomatic patterns

---

## 📈 Impact

Pulsar DAO demonstrates:
- **Innovation:** Proxy Lock is a novel governance primitive
- **Security:** Multiple layers of constraint validation
- **Usability:** Clean UI with clear visual feedback
- **Reliability:** Comprehensive test coverage (29/29 passing)
- **Treasury Execution:** Trustless on-chain token transfers
- **Production Quality:** Zero warnings, idiomatic code

---

**Built with ❤️ by GushALKDev**
