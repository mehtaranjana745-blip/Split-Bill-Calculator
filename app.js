import {
    isConnected,
    setAllowed,
    isAllowed,
    getPublicKey,
    signTransaction,
    getNetworkDetails
} from 'https://esm.sh/@stellar/freighter-api@3.1.2';

import * as StellarSdk from 'https://esm.sh/stellar-sdk@12.1.0';

// Configuration
const HORIZON_URL = "https://horizon-testnet.stellar.org";
const server = new StellarSdk.Horizon.Server(HORIZON_URL);
const NETWORK_PASSPHRASE = StellarSdk.Networks.TESTNET;

// DOM Elements
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const walletInfo = document.getElementById('wallet-info');
const pubkeyDisplay = document.getElementById('pubkey-display');
const balanceDisplay = document.getElementById('balance-display');
const networkWarning = document.getElementById('network-warning');
const mainContent = document.getElementById('main-content');

const totalBillInput = document.getElementById('total-bill');
const recipientsList = document.getElementById('recipients-list');
const addRecipientBtn = document.getElementById('add-recipient-btn');
const splitSummary = document.getElementById('split-summary');
const amountPerPersonDisplay = document.getElementById('amount-per-person');
const sendBtn = document.getElementById('send-btn');

const transactionStatus = document.getElementById('transaction-status');
const statusTitle = document.getElementById('status-title');
const statusMessage = document.getElementById('status-message');
const explorerLink = document.getElementById('explorer-link');

// Application State
let userPublicKey = null;
let userBalance = 0;

// Utility to format address
const shortenAddress = (address) => `${address.slice(0, 6)}...${address.slice(-4)}`;

// Initialize Application
async function init() {
    setupEventListeners();
    addRecipientInput(); // Add first recipient input by default
    checkWalletStatus();
}

function setupEventListeners() {
    connectBtn.addEventListener('click', handleConnectWallet);
    disconnectBtn.addEventListener('click', handleDisconnect);
    addRecipientBtn.addEventListener('click', addRecipientInput);
    totalBillInput.addEventListener('input', calculateSplit);
    sendBtn.addEventListener('click', handleSendTransaction);
}

async function checkWalletStatus() {
    if (await isConnected() && await isAllowed()) {
        try {
            const pubKey = await getPublicKey();
            if (pubKey) {
                await setupWallet(pubKey);
            }
        } catch (e) {
            console.error("Error checking wallet status:", e);
        }
    }
}

async function handleConnectWallet() {
    if (!(await isConnected())) {
        alert("Freighter wallet not installed! Please install the Freighter extension.");
        return;
    }
    
    try {
        connectBtn.disabled = true;
        connectBtn.textContent = "Connecting...";
        
        await setAllowed();
        const pubKey = await getPublicKey();
        await setupWallet(pubKey);
    } catch (e) {
        console.error("Connection rejected or failed", e);
        alert("Failed to connect wallet.");
    } finally {
        connectBtn.disabled = false;
        connectBtn.textContent = "Connect Wallet";
    }
}

async function setupWallet(pubKey) {
    userPublicKey = pubKey;
    
    // Check Network
    const network = await getNetworkDetails();
    if (network.network !== "TESTNET") {
        networkWarning.classList.remove('hidden');
    } else {
        networkWarning.classList.add('hidden');
    }

    // UI Updates
    connectBtn.classList.add('hidden');
    walletInfo.classList.remove('hidden');
    pubkeyDisplay.textContent = shortenAddress(pubKey);
    mainContent.classList.add('active'); // Enable form
    
    await fetchBalance();
}

function handleDisconnect() {
    userPublicKey = null;
    userBalance = 0;
    
    connectBtn.classList.remove('hidden');
    walletInfo.classList.add('hidden');
    mainContent.classList.remove('active'); // Disable form
    networkWarning.classList.add('hidden');
    
    totalBillInput.value = '';
    recipientsList.innerHTML = '';
    addRecipientInput();
    calculateSplit();
    hideTransactionStatus();
}

async function fetchBalance() {
    try {
        balanceDisplay.textContent = "Balance: Fetching...";
        const account = await server.loadAccount(userPublicKey);
        
        // Find XLM balance
        const xlmBalance = account.balances.find(b => b.asset_type === 'native');
        if (xlmBalance) {
            userBalance = parseFloat(xlmBalance.balance);
            balanceDisplay.textContent = `Balance: ${userBalance.toFixed(2)} XLM`;
        } else {
            userBalance = 0;
            balanceDisplay.textContent = "Balance: 0 XLM";
        }
    } catch (e) {
        if (e.response && e.response.status === 404) {
            balanceDisplay.textContent = "Unfunded (Use Friendbot)";
            userBalance = 0;
        } else {
            console.error("Failed to fetch balance", e);
            balanceDisplay.textContent = "Balance: Error";
        }
    }
}

// Split Logic
function addRecipientInput() {
    const row = document.createElement('div');
    row.className = 'recipient-row';
    
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Recipient Stellar Address (G...)';
    input.className = 'recipient-address';
    input.addEventListener('input', () => {
        validateAddressInput(input);
        calculateSplit();
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn secondary icon-only';
    removeBtn.innerHTML = '✕';
    removeBtn.onclick = () => {
        row.remove();
        calculateSplit();
    };

    row.appendChild(input);
    row.appendChild(removeBtn);
    recipientsList.appendChild(row);
    calculateSplit();
}

function validateAddressInput(inputElement) {
    const address = inputElement.value.trim();
    if (address === '') {
        inputElement.style.borderColor = 'var(--glass-border)';
        return false;
    }
    
    if (StellarSdk.StrKey.isValidEd25519PublicKey(address)) {
        inputElement.style.borderColor = 'var(--success-color)';
        return true;
    } else {
        inputElement.style.borderColor = 'var(--error-color)';
        return false;
    }
}

function calculateSplit() {
    const totalBill = parseFloat(totalBillInput.value);
    const addressInputs = document.querySelectorAll('.recipient-address');
    
    let validAddresses = [];
    addressInputs.forEach(input => {
        const addr = input.value.trim();
        if (StellarSdk.StrKey.isValidEd25519PublicKey(addr)) {
            validAddresses.push(addr);
        }
    });

    if (isNaN(totalBill) || totalBill <= 0 || validAddresses.length === 0) {
        splitSummary.classList.add('hidden');
        sendBtn.disabled = true;
        return;
    }

    const splitAmount = (totalBill / validAddresses.length).toFixed(7);
    amountPerPersonDisplay.textContent = `${splitAmount} XLM`;
    splitSummary.classList.remove('hidden');

    // Check if we have enough balance to cover the bill + fees (roughly)
    if (userBalance < totalBill + 0.01) {
        sendBtn.disabled = true;
        sendBtn.textContent = "Insufficient Balance";
    } else {
        sendBtn.disabled = false;
        sendBtn.textContent = "Send Split Payments";
    }
    
    return { validAddresses, splitAmount };
}

// Transaction Logic
function showTransactionStatus(status, title, message, txHash = null) {
    transactionStatus.classList.remove('hidden', 'pending', 'success', 'error');
    transactionStatus.classList.add(status);
    statusTitle.textContent = title;
    statusMessage.textContent = message;
    
    if (txHash) {
        explorerLink.classList.remove('hidden');
        explorerLink.href = `https://stellar.expert/explorer/testnet/tx/${txHash}`;
    } else {
        explorerLink.classList.add('hidden');
    }
}

function hideTransactionStatus() {
    transactionStatus.classList.add('hidden');
}

async function handleSendTransaction() {
    const splitData = calculateSplit();
    if (!splitData) return;

    const { validAddresses, splitAmount } = splitData;

    try {
        sendBtn.disabled = true;
        sendBtn.textContent = "Building Transaction...";
        hideTransactionStatus();

        // 1. Load sender account to get sequence number
        const account = await server.loadAccount(userPublicKey);

        // 2. Build Transaction
        let builder = new StellarSdk.TransactionBuilder(account, {
            fee: StellarSdk.BASE_FEE,
            networkPassphrase: NETWORK_PASSPHRASE
        });

        // Add payment operation for each recipient
        validAddresses.forEach(recipient => {
            builder.addOperation(StellarSdk.Operation.payment({
                destination: recipient,
                asset: StellarSdk.Asset.native(),
                amount: splitAmount
            }));
        });

        const transaction = builder.setTimeout(100).build();

        // 3. Sign Transaction via Freighter
        sendBtn.textContent = "Waiting for Signature...";
        showTransactionStatus('pending', 'Pending Signature', 'Please check Freighter to sign the transaction.');
        
        const signedTxXdr = await signTransaction(transaction.toXDR(), {
            network: NETWORK_PASSPHRASE,
            networkPassphrase: NETWORK_PASSPHRASE
        });

        // 4. Submit Transaction to Horizon
        sendBtn.textContent = "Submitting to Network...";
        showTransactionStatus('pending', 'Submitting', 'Transaction signed. Submitting to Stellar Testnet...');
        
        const txToSubmit = StellarSdk.TransactionBuilder.fromXDR(signedTxXdr, NETWORK_PASSPHRASE);
        const response = await server.submitTransaction(txToSubmit);

        // 5. Success
        showTransactionStatus('success', 'Success!', 'Payments sent successfully.', response.hash);
        sendBtn.textContent = "Send Split Payments";
        await fetchBalance(); // Refresh balance

    } catch (error) {
        console.error("Transaction Error:", error);
        
        // Handle User Rejection or Network errors
        let errorMsg = error.message || "An unknown error occurred.";
        if (typeof error === 'string') {
            errorMsg = error;
        } else if (error.response && error.response.data && error.response.data.extras) {
            // Unpack Horizon error
            const resultCodes = error.response.data.extras.result_codes;
            errorMsg = `Transaction Failed. Code: ${resultCodes.transaction || 'Unknown'}`;
        }
        
        showTransactionStatus('error', 'Transaction Failed', errorMsg);
        sendBtn.disabled = false;
        sendBtn.textContent = "Send Split Payments";
    }
}

// Boot
init();
