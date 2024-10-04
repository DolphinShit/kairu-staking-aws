"use client";

import { ConnectButton, useWalletInfo, useConnectionManager, useReadContract } from "thirdweb/react";
import { client } from "./client";
import { useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall } from "thirdweb";
import { sepolia, bscTestnet, mainnet} from "thirdweb/chains";
import { Toast } from 'primereact/toast';
import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

const staking_address = process.env.NEXT_PUBLIC_STAKING_ADDRESS as string;
const reward_address = process.env.NEXT_PUBLIC_REWARD_ADDRESS as string;

export default function Home() {
  const { activeWalletStore } = useConnectionManager();
  const connectedWallet = activeWalletStore.getValue()?.getAccount()?.address;
  const [userBalance, setUserBalance] = useState<string>("0");
  const [pendingRewards, setPendingRewards] = useState<string>("0");
  const toast = useRef<Toast>(null);
  const [isLoading, setIsLoading] = useState<{ [key: number]: boolean }>({
    0: false,
    1: false,
    2: false,
  });
  const [userStakes, setUserStakes] = useState<{ [key: number]: boolean }>({
    0: false,
    1: false,
    2: false,
  });
  
  const [claimLoading, setClaimLoading] = useState<boolean>(false);
  const showSuccess = (message: string) => {
    toast?.current?.show({ severity: 'success', summary: 'Success', detail: message, life: 3000 });
  }

  const showError = (message: string) => {
    toast?.current?.show({ severity: 'error', summary: 'Error', detail: message, life: 3000 });
  }

  const contract = getContract({
    address: staking_address,
    chain: mainnet,
    client,
  });

  const rewardContract = getContract({
    address: reward_address,
    chain: mainnet,
    client,
  });

  const { data: stakedWalletsInTier0, isLoading: isStakedWalletsLoadingInTier0 } = useReadContract({
    contract,
    method: "function getStakedWallets(uint8 tierIndex) view returns (address[])",
    params: [0],
  });

  const { data: stakedWalletsInTier1, isLoading: isStakedWalletsLoadingInTier1 } = useReadContract({
    contract,
    method: "function getStakedWallets(uint8 tierIndex) view returns (address[])",
    params: [1],
  });

  const { data: stakedWalletsInTier2, isLoading: isStakedWalletsLoadingInTier2 } = useReadContract({
    contract,
    method: "function getStakedWallets(uint8 tierIndex) view returns (address[])",
    params: [2],
  });

  const { data: stakesInTier0 } = useReadContract({
    contract,
    method: "function stakes(address, uint256) view returns (uint256, uint256, uint256, uint256)",
    params: [connectedWallet as string, BigInt(0)],
  });

  const { data: stakesInTier1 } = useReadContract({
    contract,
    method: "function stakes(address, uint256) view returns (uint256, uint256, uint256, uint256)",
    params: [connectedWallet as string, BigInt(1)],
  });

  const { data: stakesInTier2 } = useReadContract({
    contract,
    method: "function stakes(address, uint256) view returns (uint256, uint256, uint256, uint256)",
    params: [connectedWallet as string, BigInt(2)],
  });

  const { data: balance } = useReadContract({
    contract: rewardContract,
    method: "function balanceOf(address account) view returns (uint256)",
    params: [connectedWallet as string],
  });

  useEffect(() => {
    if (balance) {
      setUserBalance(balance.toString());
    }
  }, [balance]);

  useEffect(() => {
    fetchPendingRewards();
  }, [stakesInTier0, stakesInTier1, stakesInTier2]);

  const checkUserStakes = () => {
    const newUserStakes = { 0: false, 1: false, 2: false };

    [stakesInTier0, stakesInTier1, stakesInTier2].forEach((stake) => {
      if (stake && stake.length >= 2) {
        const amount = BigInt(stake[0]);
        const tierIndex = Number(stake[1]);

        if (amount > 0) {
          newUserStakes[tierIndex as keyof typeof newUserStakes] = true;
        }
      }
    });

    setUserStakes(newUserStakes);
  };

  useEffect(() => {
    checkUserStakes();
  }, [stakesInTier0, stakesInTier1, stakesInTier2]);

  const fetchPendingRewards = () => {
    if (!connectedWallet) return;

    let totalPendingRewards = BigInt(0);

    const allStakes = [stakesInTier0, stakesInTier1, stakesInTier2];

    allStakes.forEach(stake => {
      if (stake && stake.length > 0) {
        const pendingRewardsForTier = stake[2]; // Index 2 is pendingRewards in the Stake struct
        totalPendingRewards += BigInt(pendingRewardsForTier);
      }
    });

    // Convert wei to ETH and set state
    setPendingRewards(ethers.formatEther(totalPendingRewards));
  };


  const { mutateAsync: sendTxAsync, data: transactionResult } = useSendTransaction();


  const handleStakeClick = async (tierIndex: number, amount: number) => {
    try {

      if (isLoading[tierIndex]) return;

      setIsLoading({ ...isLoading, [tierIndex]: true });
      const stakeContractCall = prepareContractCall({
        contract: rewardContract,
        method: "function approve(address spender, uint256 amount)",
        params: [staking_address, BigInt(amount)],
      });

      const result1 = await sendTxAsync(stakeContractCall);
      console.log(result1);

      const transaction = prepareContractCall({
        contract,
        method: "function stake(uint256 amount, uint8 tierIndex)",
        params: [BigInt(amount), tierIndex],
      });
      const result = await sendTxAsync(transaction);
      console.log(result);
      showSuccess("Successfully staked");
    } catch (err) {
      console.log(err);
      showError("Something went wrong");
    } finally {
      console.log("done");
      setIsLoading({ ...isLoading, [tierIndex]: false });
    }
  };

  const handleUnstake = async (stakeIndex: number) => {
    try {
      setIsLoading({ ...isLoading, [stakeIndex]: true });
      const transaction = prepareContractCall({
        contract,
        method: "function unstake(uint256 stakeIndex)",
        params: [BigInt(stakeIndex)],
      });
      const result = await sendTxAsync(transaction);
      console.log(result);
      showSuccess("Successfully unstaked");
    } catch (err) {
      console.log(err);
      if (err?.toString().includes("Tokens are still locked")) {
        showError("Tokens are still locked");
      } else {
        showError("Something went wrong while unstaking");
      }
    } finally {
      setIsLoading({ ...isLoading, [stakeIndex]: false });
    }
  };

  // New function to handle claiming rewards
  const handleClaimRewards = async () => {
    try {
      setClaimLoading(true);
      const transaction = prepareContractCall({
        contract,
        method: "function claimRewards()",
        params: [],
      });
      const result = await sendTxAsync(transaction);
      console.log(result);
      showSuccess("Successfully claimed rewards");
    } catch (err) {
      console.log(err);
      showError("Something went wrong while claiming rewards");
    } finally {
      setClaimLoading(false);
    }
  };



  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-blue-400 to-blue-600 py-10">
      <ConnectButton
        client={client}
        appMetadata={{
          name: "Example App",
          url: "https://example.com",
        }}
      />
      <Toast ref={toast} />

      {/* User Balance Box */}
      <div className="mt-6 p-4 rounded-lg bg-white shadow-lg w-full max-w-4xl">
        <h2 className="text-xl font-bold text-center mb-4 text-blue-800">Your Balance</h2>
        <div className="text-center text-2xl font-bold text-green-600">
          {parseFloat(userBalance) / 1e18} Kairu
        </div>
      </div>

      {/* Pending Rewards Box */}
      <div className="mt-6 p-4 rounded-lg bg-white shadow-lg w-full max-w-4xl">
        <h2 className="text-xl font-bold text-center mb-4 text-blue-800">Pending Rewards</h2>
        <div className="text-center text-2xl font-bold text-green-600 mb-4">
          {parseFloat(pendingRewards).toFixed(6)} ETH
        </div>
        <button
          className="w-full bg-green-500 text-white rounded-lg py-2"
          onClick={handleClaimRewards}
          disabled={claimLoading || parseFloat(pendingRewards) === 0}
        >
          {claimLoading ? "Claiming..." : "Claim Rewards"}
        </button>
      </div>

      {/* Staking UI Box */}
      <div className="mt-6 p-4 rounded-lg bg-white shadow-lg w-full max-w-4xl">
        <h2 className="text-xl font-bold text-center mb-4 text-blue-800">Staking Tiers</h2>
        <div className="flex justify-between space-x-4">
          {/* Gold Tier */}
          <div className="flex-1 p-4 rounded-lg bg-gradient-to-r from-yellow-400 to-yellow-600 text-white shadow-lg">
            <h3 className="text-lg font-bold">Gold Tier</h3>
            <div className="mt-4 space-y-2">
              <div>
                <span className="font-semibold">REWARDS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">50% LP-FEES</div>
              </div>
              <div>
                <span className="font-semibold">AMOUNT:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">15m Kairu</div>
              </div>
              <div>
                <span className="font-semibold">LOCKED:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">15 days</div>
              </div>
              <div>
                <span className="font-semibold">STAKED WALLETS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1 text-black">
                  {stakedWalletsInTier0?.length || 0}
                </div>
              </div>
              {userStakes[0] ? (
                <button className="mt-2 w-full bg-red-500 text-white rounded-lg py-2" onClick={() => handleUnstake(0)}>
                  {isLoading[0] ? "Unstaking..." : "Unstake"}
                </button>
              ) : (
                <button className="mt-4 w-full bg-green-500 text-white rounded-lg py-2" onClick={() => handleStakeClick(0, 15000000000000000000000000)}>
                  {isLoading[0] ? "Staking..." : "Stake"}
                </button>
              )}
            </div>
          </div>

          {/* Silver Tier */}
          <div className="flex-1 p-4 rounded-lg bg-gradient-to-r from-gray-300 to-gray-500 text-white shadow-lg">
            <h3 className="text-lg font-bold">Silver Tier</h3>
            <div className="mt-4 space-y-2">
              <div>
                <span className="font-semibold">REWARDS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">35% LP-FEES</div>
              </div>
              <div>
                <span className="font-semibold">AMOUNT:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">7.5m Kairu</div>
              </div>
              <div>
                <span className="font-semibold">LOCKED:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">20 days</div>
              </div>
              <div>
                <span className="font-semibold">STAKED WALLETS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1 text-black">
                  {stakedWalletsInTier1?.length || 0}
                </div>
              </div>
              {userStakes[1] ? (
                <button className="mt-2 w-full bg-red-500 text-white rounded-lg py-2" onClick={() => handleUnstake(1)}>
                  {isLoading[1] ? "Unstaking..." : "Unstake"}
                </button>
              ) : (
                <button className="mt-4 w-full bg-green-500 text-white rounded-lg py-2" onClick={() => handleStakeClick(1, 7500000000000000000000000)}>
                  {isLoading[1] ? "Staking..." : "Stake"}
                </button>
              )}
            </div>
          </div>

          {/* Bronze Tier */}
          <div className="flex-1 p-4 rounded-lg bg-[#cd7f32] text-white shadow-lg">
            <h3 className="text-lg font-bold">Bronze Tier</h3>
            <div className="mt-4 space-y-2">
              <div>
                <span className="font-semibold">REWARDS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">15% LP-FEES</div>
              </div>
              <div>
                <span className="font-semibold">AMOUNT:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">3.75m Kairu</div>
              </div>
              <div>
                <span className="font-semibold">LOCKED:</span>
                <div className="bg-gray-200 p-2 rounded mt-1">30 days</div>
              </div>
              <div>
                <span className="font-semibold">STAKED WALLETS:</span>
                <div className="bg-gray-200 p-2 rounded mt-1 text-black">
                  {stakedWalletsInTier2?.length || 0}
                </div>
              </div>
              {userStakes[2] ? (
                <button className="mt-2 w-full bg-red-500 text-white rounded-lg py-2" onClick={() => handleUnstake(2)}>
                  {isLoading[2] ? "Unstaking..." : "Unstake"}
                </button>
              ) : (
                <button className="mt-4 w-full bg-green-500 text-white rounded-lg py-2" onClick={() => handleStakeClick(2, 3750000000000000000000000)}>
                  {isLoading[2] ? "Staking..." : "Stake"}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
