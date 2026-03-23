"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getContract, isAddress, prepareContractCall } from "thirdweb";
import { useActiveAccount, useSendTransaction } from "thirdweb/react";
import { formatUnits, parseUnits } from "viem";
import confetti from "canvas-confetti";
import { WalletConnectButton } from "@/components/wallet/WalletConnectButton";
import {
  celoChain,
  thirdwebClient,
  activeCeloNetworkLabel,
  celoExplorerBaseUrl,
} from "@/lib/celo";
import {
  ERC20_APPROVE_ABI,
  ESCROW_ABI,
  STABLECOIN_ADDRESS_BY_SYMBOL,
  getEscrowContractAddress,
  getEscrowSellerAddress,
} from "@/lib/escrow";
import { formatNumberWithDelimiters } from "@/lib/utils";
import { toast } from "@/lib/toast";

const TOKEN_DECIMALS = 18;
const NATIVE_CELO_ALIAS = "native";
const NATIVE_CELO_TOKEN_ADDRESS = "0x0000000000000000000000000000000000000000";

function normalizeCurrency(
  value: string | null,
): "CELO" | "cUSD" | "cEUR" | "cREAL" {
  const normalized = String(value || "")
    .trim()
    .toUpperCase();
  if (normalized === "CELO") return "CELO";
  if (normalized === "CEUR") return "cEUR";
  if (normalized === "CREAL") return "cREAL";
  return "cUSD";
}

function toStringValue(input: string | null, fallback = ""): string {
  return String(input || fallback).trim();
}

function getTransactionHash(result: unknown): string {
  if (!result || typeof result !== "object") {
    return "";
  }

  const maybeHash = (result as { transactionHash?: unknown; hash?: unknown })
    .transactionHash;
  if (typeof maybeHash === "string" && maybeHash.trim()) {
    return maybeHash.trim();
  }

  const maybeAltHash = (result as { hash?: unknown }).hash;
  if (typeof maybeAltHash === "string" && maybeAltHash.trim()) {
    return maybeAltHash.trim();
  }

  return "";
}

export function PayCheckoutClient() {
  const searchParams = useSearchParams();
  const account = useActiveAccount();
  const { mutateAsync: sendTransaction, isPending } = useSendTransaction();

  const [approvalTxHash, setApprovalTxHash] = useState("");
  const [depositTxHash, setDepositTxHash] = useState("");
  const [saving, setSaving] = useState(false);
  const [purchaseCompleted, setPurchaseCompleted] = useState(false);
  const [walletTokenBalanceRaw, setWalletTokenBalanceRaw] = useState<
    bigint | null
  >(null);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState("");

  const paymentInput = useMemo(() => {
    const jobId = toStringValue(searchParams.get("jobId"));
    const productName = toStringValue(
      searchParams.get("productName"),
      "Eazee Product",
    );
    const priceRaw = toStringValue(searchParams.get("price"), "0");
    const currency = normalizeCurrency(searchParams.get("currency"));
    const seller =
      toStringValue(searchParams.get("seller")) || getEscrowSellerAddress();
    const ownerWalletAddress = toStringValue(
      searchParams.get("ownerWalletAddress"),
      seller,
    ).toLowerCase();
    const tokenAddress =
      currency === "CELO"
        ? NATIVE_CELO_ALIAS
        : STABLECOIN_ADDRESS_BY_SYMBOL[currency] ||
          STABLECOIN_ADDRESS_BY_SYMBOL.cUSD;

    return {
      jobId,
      productName,
      priceRaw,
      currency,
      seller,
      ownerWalletAddress,
      tokenAddress,
    };
  }, [searchParams]);

  const normalizedAmountValue = String(paymentInput.priceRaw || "")
    .replace(/,/g, "")
    .trim();

  let requiredAmountWei: bigint | null = null;
  try {
    requiredAmountWei = normalizedAmountValue
      ? parseUnits(normalizedAmountValue, TOKEN_DECIMALS)
      : null;
  } catch {
    requiredAmountWei = null;
  }

  const isValidAmount =
    requiredAmountWei !== null && requiredAmountWei > BigInt(0);

  const walletTokenBalanceFormatted =
    walletTokenBalanceRaw !== null
      ? formatNumberWithDelimiters(
          Number.parseFloat(
            formatUnits(walletTokenBalanceRaw, TOKEN_DECIMALS),
          ).toFixed(6),
        )
      : "";

  const hasInsufficientTokenBalance =
    requiredAmountWei !== null &&
    walletTokenBalanceRaw !== null &&
    walletTokenBalanceRaw < requiredAmountWei;

  const escrowAddress = getEscrowContractAddress();
  const hasValidEscrowAddress = isAddress(escrowAddress);
  const isNativeCeloPayment = paymentInput.currency === "CELO";
  const paymentAssetLabel = isNativeCeloPayment
    ? "CELO"
    : paymentInput.currency;
  const isBuyerSameAsSeller =
    String(account?.address || "")
      .trim()
      .toLowerCase() ===
    String(paymentInput.seller || "")
      .trim()
      .toLowerCase();
  const isPurchaseLocked = purchaseCompleted || Boolean(depositTxHash);
  const hasRequiredConfig = isNativeCeloPayment
    ? Boolean(paymentInput.seller && hasValidEscrowAddress)
    : Boolean(
        hasValidEscrowAddress &&
        paymentInput.seller &&
        paymentInput.tokenAddress,
      );

  const escrowContract = useMemo(() => {
    if (!hasValidEscrowAddress) {
      return null;
    }

    return getContract({
      client: thirdwebClient,
      chain: celoChain,
      address: escrowAddress,
      abi: ESCROW_ABI,
    });
  }, [escrowAddress, hasValidEscrowAddress]);

  const tokenContract = useMemo(() => {
    if (isNativeCeloPayment || !isAddress(paymentInput.tokenAddress)) {
      return null;
    }

    return getContract({
      client: thirdwebClient,
      chain: celoChain,
      address: paymentInput.tokenAddress,
      abi: ERC20_APPROVE_ABI,
    });
  }, [paymentInput.tokenAddress, isNativeCeloPayment]);

  useEffect(() => {
    const walletAddress = String(account?.address || "").trim();
    if (!walletAddress || !paymentInput.tokenAddress) {
      setWalletTokenBalanceRaw(null);
      setBalanceError("");
      return;
    }

    let active = true;

    async function loadTokenBalance() {
      setBalanceLoading(true);
      setBalanceError("");

      try {
        const chainId = Number(
          process.env.NEXT_PUBLIC_CELO_CHAIN_ID || "42220",
        );
        const response = await fetch(
          `/api/payments/token-balance?walletAddress=${encodeURIComponent(walletAddress)}&tokenAddress=${encodeURIComponent(paymentInput.tokenAddress)}&chainId=${chainId}`,
          {
            cache: "no-store",
          },
        );

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : "Failed to read token balance",
          );
        }

        const raw = String(payload?.balanceRaw || "0");
        const parsed = BigInt(raw);
        if (active) {
          setWalletTokenBalanceRaw(parsed);
          setBalanceError("");
        }
      } catch (error) {
        if (active) {
          setWalletTokenBalanceRaw(null);
          setBalanceError(
            error instanceof Error
              ? error.message
              : "Failed to read token balance",
          );
        }
      } finally {
        if (active) {
          setBalanceLoading(false);
        }
      }
    }

    void loadTokenBalance();

    return () => {
      active = false;
    };
  }, [account?.address, paymentInput.tokenAddress]);

  async function persistPaymentRecord(
    txHash: string,
    options?: {
      tokenAddress?: string;
      contractAddress?: string;
      escrowStatus?: "pending" | "confirmed" | "refunded";
    },
  ) {
    const buyer = String(account?.address || "").trim();
    if (!txHash || !buyer) {
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          txHash,
          buyer,
          seller: paymentInput.seller,
          tokenAddress: options?.tokenAddress || paymentInput.tokenAddress,
          amount: paymentInput.priceRaw,
          currency: paymentInput.currency,
          productId: paymentInput.jobId || `tg-pay-${Date.now()}`,
          productName: paymentInput.productName,
          contractAddress: options?.contractAddress || escrowAddress,
          ownerWalletAddress: paymentInput.ownerWalletAddress,
          chainId: Number(process.env.NEXT_PUBLIC_CELO_CHAIN_ID || "42220"),
          escrowStatus: options?.escrowStatus || "pending",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "Failed to persist payment",
        );
      }

      toast({
        title: "Payment saved",
        description: "Transaction is now visible in dashboard payment records.",
      });
    } catch (error) {
      toast({
        title: "Save failed",
        description:
          error instanceof Error
            ? error.message
            : "Could not persist payment record",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    if (isNativeCeloPayment) {
      toast({
        title: "Approval not needed",
        description: "Native CELO transfer does not require token approval.",
      });
      return;
    }

    if (!account?.address) {
      toast({
        title: "Connect wallet first",
        description: "Connect buyer wallet before approving token spend.",
        variant: "error",
      });
      return;
    }

    if (!isValidAmount) {
      toast({
        title: "Invalid amount",
        description: "Price is missing or invalid in this payment link.",
        variant: "error",
      });
      return;
    }

    if (hasInsufficientTokenBalance) {
      toast({
        title: `Insufficient ${paymentAssetLabel} balance`,
        description: `You need ${paymentInput.priceRaw} ${paymentAssetLabel}, but wallet balance is lower.`,
        variant: "error",
      });
      return;
    }

    if (!tokenContract) {
      toast({
        title: "Token configuration error",
        description: "Could not initialize payment token contract.",
        variant: "error",
      });
      return;
    }

    if (!requiredAmountWei || requiredAmountWei <= BigInt(0)) {
      toast({
        title: "Invalid amount",
        description: "Price is missing or invalid in this payment link.",
        variant: "error",
      });
      return;
    }

    const amount = requiredAmountWei;

    try {
      const approveTx = prepareContractCall({
        contract: tokenContract,
        method: "approve",
        params: [escrowAddress, amount],
      });

      const result = await sendTransaction(approveTx);
      const txHash = getTransactionHash(result);
      setApprovalTxHash(txHash);

      toast({
        title: "Approval submitted",
        description: txHash || "Approval transaction sent.",
      });
    } catch (error) {
      toast({
        title: "Approval failed",
        description:
          error instanceof Error ? error.message : "Could not approve token",
        variant: "error",
      });
    }
  }

  async function handleDeposit() {
    if (!account?.address) {
      toast({
        title: "Connect wallet first",
        description: "Connect buyer wallet before payment.",
        variant: "error",
      });
      return;
    }

    if (!isValidAmount) {
      toast({
        title: "Invalid amount",
        description: "Price is missing or invalid in this payment link.",
        variant: "error",
      });
      return;
    }

    if (hasInsufficientTokenBalance) {
      toast({
        title: `Insufficient ${paymentAssetLabel} balance`,
        description: `You need ${paymentInput.priceRaw} ${paymentAssetLabel}, but wallet balance is lower.`,
        variant: "error",
      });
      return;
    }

    if (!escrowContract) {
      toast({
        title: "Escrow configuration error",
        description: "Escrow contract address is missing or invalid.",
        variant: "error",
      });
      return;
    }

    if (isBuyerSameAsSeller) {
      toast({
        title: "Use a different buyer wallet",
        description:
          "Buyer wallet cannot be the same as seller wallet for this escrow payment.",
        variant: "error",
      });
      return;
    }

    if (!requiredAmountWei || requiredAmountWei <= BigInt(0)) {
      toast({
        title: "Invalid amount",
        description: "Price is missing or invalid in this payment link.",
        variant: "error",
      });
      return;
    }

    const amount = requiredAmountWei;

    try {
      if (isNativeCeloPayment) {
        const depositNativeTx = prepareContractCall({
          contract: escrowContract,
          method: "depositNative",
          params: [
            paymentInput.seller,
            paymentInput.jobId || `tg-${Date.now()}`,
            paymentInput.productName,
          ],
          value: amount,
        });

        const result = await sendTransaction(depositNativeTx);
        const txHash = getTransactionHash(result);
        setDepositTxHash(txHash);

        await persistPaymentRecord(txHash, {
          tokenAddress: NATIVE_CELO_TOKEN_ADDRESS,
          contractAddress: escrowAddress,
          escrowStatus: "pending",
        });

        setPurchaseCompleted(true);
        confetti({
          particleCount: 120,
          spread: 70,
          origin: { y: 0.6 },
        });

        toast({
          title: "Payment submitted",
          description: txHash || "Native CELO escrow deposit sent.",
        });
        return;
      }

      const depositTx = prepareContractCall({
        contract: escrowContract,
        method: "deposit",
        params: [
          paymentInput.seller,
          paymentInput.tokenAddress,
          amount,
          paymentInput.jobId || `tg-${Date.now()}`,
          paymentInput.productName,
        ],
      });

      const result = await sendTransaction(depositTx);
      const txHash = getTransactionHash(result);
      setDepositTxHash(txHash);

      await persistPaymentRecord(txHash);
      setPurchaseCompleted(true);
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
      });

      toast({
        title: "Payment submitted",
        description: txHash || "Escrow deposit transaction sent.",
      });
    } catch (error) {
      toast({
        title: "Payment failed",
        description:
          error instanceof Error ? error.message : "Could not submit payment",
        variant: "error",
      });
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl p-4 sm:p-6 space-y-4">
      <div
        className="rounded-2xl border p-4 sm:p-5"
        style={{
          background: "var(--bg-elevated)",
          borderColor: "var(--border)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
              Telegram Checkout
            </p>
            <h1
              className="text-xl font-semibold"
              style={{ color: "var(--text-primary)" }}
            >
              {paymentInput.productName}
            </h1>
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              Network: {activeCeloNetworkLabel}
            </p>
          </div>
          <WalletConnectButton compact />
        </div>

        {!isPurchaseLocked ? (
          <>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-primary)",
                }}
              >
                <p style={{ color: "var(--text-secondary)" }}>Amount</p>
                <p
                  className="font-semibold"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatNumberWithDelimiters(paymentInput.priceRaw)}{" "}
                  {paymentInput.currency}
                </p>
              </div>
              <div
                className="rounded-xl border p-3"
                style={{
                  borderColor: "var(--border)",
                  background: "var(--bg-primary)",
                }}
              >
                <p style={{ color: "var(--text-secondary)" }}>
                  Product reference
                </p>
                <p
                  className="font-semibold truncate"
                  style={{ color: "var(--text-primary)" }}
                >
                  {paymentInput.jobId || "tg-checkout"}
                </p>
              </div>
            </div>

            <div
              className="mt-3 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              {account?.address ? (
                balanceLoading ? (
                  <p>Checking wallet {paymentAssetLabel} balance...</p>
                ) : balanceError ? (
                  <p style={{ color: "#ef4444" }}>
                    Balance check failed: {balanceError}
                  </p>
                ) : (
                  <p>
                    Wallet {paymentAssetLabel} balance:{" "}
                    {walletTokenBalanceFormatted || "0"} {paymentAssetLabel}
                  </p>
                )
              ) : (
                <p>Connect wallet to check payment balance before purchase.</p>
              )}
            </div>

            {hasInsufficientTokenBalance ? (
              <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>
                Insufficient {paymentAssetLabel}. This wallet needs at least{" "}
                {paymentInput.priceRaw} {paymentAssetLabel} to pay.
              </p>
            ) : null}

            {!hasRequiredConfig ? (
              <p className="mt-4 text-sm" style={{ color: "#ef4444" }}>
                {isNativeCeloPayment
                  ? "Missing escrow configuration. Set NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS and NEXT_PUBLIC_ESCROW_SELLER_ADDRESS."
                  : "Missing escrow configuration. Set NEXT_PUBLIC_ESCROW_CONTRACT_ADDRESS and NEXT_PUBLIC_ESCROW_SELLER_ADDRESS."}
              </p>
            ) : null}

            {isNativeCeloPayment ? (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={handleDeposit}
                  disabled={
                    isPending ||
                    !hasRequiredConfig ||
                    !isValidAmount ||
                    isBuyerSameAsSeller ||
                    hasInsufficientTokenBalance
                  }
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--brand-green)" }}
                >
                  {isPending ? "Processing..." : "Buy Now (Native CELO)"}
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isPending || !hasRequiredConfig || !isValidAmount}
                  className="rounded-xl px-4 py-2.5 text-sm font-medium disabled:opacity-60"
                  style={{
                    background: "var(--bg-secondary)",
                    color: "var(--text-primary)",
                    border: "1px solid var(--border)",
                  }}
                >
                  {isPending ? "Processing..." : "Approve Token"}
                </button>
                <button
                  type="button"
                  onClick={handleDeposit}
                  disabled={
                    isPending ||
                    !hasRequiredConfig ||
                    !isValidAmount ||
                    isBuyerSameAsSeller ||
                    hasInsufficientTokenBalance
                  }
                  className="rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--brand-green)" }}
                >
                  {isPending ? "Processing..." : "Buy Now (Escrow Deposit)"}
                </button>
              </div>
            )}

            {isBuyerSameAsSeller ? (
              <p className="mt-3 text-xs" style={{ color: "#ef4444" }}>
                You are connected with the seller wallet. Use a different buyer
                wallet (e.g., your teammate wallet) to test checkout.
              </p>
            ) : null}
          </>
        ) : null}

        {purchaseCompleted && depositTxHash ? (
          <div
            className="mt-4 rounded-xl border p-3 text-sm"
            style={{
              borderColor: "var(--brand-green)",
              background: "var(--brand-dim)",
              color: "var(--text-primary)",
            }}
          >
            <p className="font-semibold">✅ Payment sent successfully</p>
            <p className="mt-1">Escrow deposit has been submitted.</p>
            <p className="mt-1 break-all">Tx: {depositTxHash}</p>
            <a
              href={`${celoExplorerBaseUrl}/tx/${depositTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-block mt-2 underline"
              style={{ color: "var(--text-primary)" }}
            >
              Open transaction on explorer
            </a>
            <p
              className="mt-2 text-xs"
              style={{ color: "var(--text-secondary)" }}
            >
              Next: open dashboard Payments tab to confirm the new record.
            </p>
          </div>
        ) : null}

        <div
          className="mt-4 space-y-1 text-xs"
          style={{ color: "var(--text-secondary)" }}
        >
          {approvalTxHash ? <p>Approval tx: {approvalTxHash}</p> : null}
          {depositTxHash ? <p>Deposit tx: {depositTxHash}</p> : null}
          {saving ? <p>Saving payment record...</p> : null}
        </div>
      </div>
    </div>
  );
}
