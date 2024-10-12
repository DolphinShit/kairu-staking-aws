"use client";

import {
  ConnectButton,
  useWalletInfo,
  useConnectionManager,
  useReadContract,
} from "thirdweb/react";
import { client } from "./client";
import { useSendTransaction } from "thirdweb/react";
import { getContract, prepareContractCall } from "thirdweb";
import { sepolia, bscTestnet, mainnet } from "thirdweb/chains";
import { Toast } from "primereact/toast";
import { useEffect, useRef, useState } from "react";
import { ethers } from "ethers";

// Importing Press Start 2P font from Google Fonts
import Head from "next/head";

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
    toast?.current?.show({
      severity: "success",
      summary: "Success",
      detail: message,
      life: 3000,
    });
  };

  const showError = (message: string) => {
    toast?.current?.show({
      severity: "error",
      summary: "Error",
      detail: message,
      life: 3000,
    });
  };

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

  const { data: stakedWalletsInTier0 } = useReadContract({
    contract,
    method: "function getStakedWallets(uint8 tierIndex) view returns (address[])",
    params: [0],
  });

  const { data: stakedWalletsInTier1 } = useReadContract({
    contract,
    method: "function getStakedWallets(uint8 tierIndex) view returns (address[])",
    params: [1],
  });

  const { data: stakedWalletsInTier2 } = useReadContract({
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

    allStakes.forEach((stake) => {
      if (stake && stake.length > 0) {
        const pendingRewardsForTier = stake[2]; // Index 2 is pendingRewards in the Stake struct
        totalPendingRewards += BigInt(pendingRewardsForTier);
      }
    });

    // Convert wei to ETH and set state
    setPendingRewards(ethers.formatEther(totalPendingRewards));
  };

  const { mutateAsync: sendTxAsync } = useSendTransaction();

  const handleStakeClick = async (tierIndex: number, amount: number) => {
    try {
      if (isLoading[tierIndex]) return;

      setIsLoading({ ...isLoading, [tierIndex]: true });
      const stakeContractCall = prepareContractCall({
        contract: rewardContract,
        method: "function approve(address spender, uint256 amount)",
        params: [staking_address, BigInt(amount)],
      });

      await sendTxAsync(stakeContractCall);

      const transaction = prepareContractCall({
        contract,
        method: "function stake(uint256 amount, uint8 tierIndex)",
        params: [BigInt(amount), tierIndex],
      });
      await sendTxAsync(transaction);
      showSuccess("Successfully staked");
    } catch (err) {
      console.log(err);
      showError("Something went wrong");
    } finally {
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
      await sendTxAsync(transaction);
      showSuccess("Successfully unstaked");
    } catch (err) {
      console.log(err);
      showError(
        err?.toString().includes("Tokens are still locked")
          ? "Tokens are still locked"
          : "Something went wrong while unstaking"
      );
    } finally {
      setIsLoading({ ...isLoading, [stakeIndex]: false });
    }
  };

  const handleClaimRewards = async () => {
    try {
      setClaimLoading(true);
      const transaction = prepareContractCall({
        contract,
        method: "function claimRewards()",
        params: [],
      });
      await sendTxAsync(transaction);
      showSuccess("Successfully claimed rewards");
    } catch (err) {
      console.log(err);
      showError("Something went wrong while claiming rewards");
    } finally {
      setClaimLoading(false);
    }
  };

  return (
    <>
      {/* Head tag for importing the Google Font */}
      <Head>
        <link
          href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap"
          rel="stylesheet"
        />
      </Head>

      <main className="flex flex-col items-center justify-center min-h-screen bg-[#36A8FE] py-4">
        {/* Box 1: Top images and Connect button */}
        <div className="flex justify-center items-center space-x-4 mb-6">
          <img
            src="images/dolphin-gold2.png"
            alt="Gold Dolphin Top"
            className="w-[125px] h-auto"
          />
          <div className="flex justify-center items-center space-x-2">
            <img src="images/vista-logo.png" alt="Left Logo" className="w-12 h-12" />
            <ConnectButton
              client={client}
              appMetadata={{
                name: "Example App",
                url: "https://example.com",
              }}
            />
            <img src="images/vista-logo.png" alt="Right Logo" className="w-12 h-12" />
          </div>
          <img
            src="images/dolphin-bronze2.png"
            alt="Bronze Dolphin Top"
            className="w-[125px] h-auto"
          />
        </div>

        <Toast ref={toast} />

        {/* Box 2: Staking UI Box */}
        <div className="mt-2 p-4 w-full max-w-4xl pixel-font">
          <div className="flex flex-col md:flex-row justify-between items-start md:space-x-6 w-full px-4">
            {/* Gold Box Container */}
            <div className="flex flex-col items-center w-full md:max-w-[33%] px-2">
              <div className="relative flex flex-col items-center w-full bg-gradient-to-r from-[#080702] to-[#C38D15] p-2 rounded-2xl">
                <div className="flex-1 p-4 bg-white shadow-lg rounded-2xl text-center w-full">
                  <div className="bg-gradient-to-r from-[#080702] to-[#C38D15] text-white p-2 rounded-full text-xl font-bold mb-4">
                    GOLD
                  </div>
                  <div className="space-y-2 text-black text-xs md:text-sm">
                    <div>
                      <span className="font-semibold">REWARDS:</span>
                      <div className="p-2 mt-1">50% LP-FEES</div>
                    </div>
                    <div>
                      <span className="font-semibold">AMOUNT:</span>
                      <div className="p-2 mt-1">30m Kairu</div>
                    </div>
                    <div>
                      <span className="font-semibold">LOCKED:</span>
                      <div className="p-2 mt-1">15 days</div>
                    </div>
                    <div>
                      <span className="font-semibold">STAKED WALLETS:</span>
                      <div className="p-2 mt-1">{stakedWalletsInTier0?.length || 0}</div>
                    </div>
                  </div>
                  <button
                    className="mt-4 bg-[#36A8FE] text-white rounded-lg py-2 w-32 mx-auto"
                    onClick={() => handleStakeClick(0, 30_000_000)} // Updated to 30 million Kairu
                  >
                    {isLoading[0] ? "Staking..." : "Stake"}
                  </button>
                </div>
              </div>
              <img
                src="images/dolphin-gold.png"
                alt="Gold Dolphin"
                className="w-[125px] h-auto mt-2 mx-auto"
              />
            </div>

            {/* Silver Box Container */}
            <div className="flex flex-col items-center w-full md:max-w-[33%] px-2">
              <div className="relative flex flex-col items-center w-full bg-gradient-to-r from-[#A8A8A8] to-[#FDFDFD] p-2 rounded-2xl">
                <div className="flex-1 p-4 bg-white shadow-lg rounded-2xl text-center w-full">
                  <div className="bg-gradient-to-r from-[#A8A8A8] to-[#FDFDFD] text-black p-2 rounded-full text-xl font-bold mb-4">
                    SILVER
                  </div>
                  <div className="space-y-2 text-black text-xs md:text-sm">
                    <div>
                      <span className="font-semibold">REWARDS:</span>
                      <div className="p-2 mt-1">35% LP-FEES</div>
                    </div>
                    <div>
                      <span className="font-semibold">AMOUNT:</span>
                      <div className="p-2 mt-1">15m Kairu</div>
                    </div>
                    <div>
                      <span className="font-semibold">LOCKED:</span>
                      <div className="p-2 mt-1">20 days</div>
                    </div>
                    <div>
                      <span className="font-semibold">STAKED WALLETS:</span>
                      <div className="p-2 mt-1">{stakedWalletsInTier1?.length || 0}</div>
                    </div>
                  </div>
                  <button
                    className="mt-4 bg-[#36A8FE] text-white rounded-lg py-2 w-32 mx-auto"
                    onClick={() => handleStakeClick(1, 15_000_000)} // Updated to 15 million Kairu
                  >
                    {isLoading[1] ? "Staking..." : "Stake"}
                  </button>
                </div>
              </div>
              <img
                src="images/dolphin-silver.png"
                alt="Silver Dolphin"
                className="w-[125px] h-auto mt-2 mx-auto"
              />
            </div>

            {/* Bronze Box Container */}
            <div className="flex flex-col items-center w-full md:max-w-[33%] px-2">
              <div className="relative flex flex-col items-center w-full bg-gradient-to-r from-[#A44F30] to-[#b87333] p-2 rounded-2xl">
                <div className="flex-1 p-4 bg-white shadow-lg rounded-2xl text-center w-full">
                  <div className="bg-gradient-to-r from-[#A44F30] to-[#b87333] text-white p-2 rounded-full text-xl font-bold mb-4">
                    BRONZE
                  </div>
                  <div className="space-y-2 text-black text-xs md:text-sm">
                    <div>
                      <span className="font-semibold">REWARDS:</span>
                      <div className="p-2 mt-1">15% LP-FEES</div>
                    </div>
                    <div>
                      <span className="font-semibold">AMOUNT:</span>
                      <div className="p-2 mt-1">7.5m Kairu</div>
                    </div>
                    <div>
                      <span className="font-semibold">LOCKED:</span>
                      <div className="p-2 mt-1">30 days</div>
                    </div>
                    <div>
                      <span className="font-semibold">STAKED WALLETS:</span>
                      <div className="p-2 mt-1">{stakedWalletsInTier2?.length || 0}</div>
                    </div>
                  </div>
                  <button
                    className="mt-4 bg-[#36A8FE] text-white rounded-lg py-2 w-32 mx-auto"
                    onClick={() => handleStakeClick(2, 7_500_000)} // Updated to 7.5 million Kairu
                  >
                    {isLoading[2] ? "Staking..." : "Stake"}
                  </button>
                </div>
              </div>
              <img
                src="images/dolphin-bronze.png"
                alt="Bronze Dolphin"
                className="w-[125px] h-auto mt-2 mx-auto"
              />
            </div>
          </div>
        </div>

        {/* User Balance and Pending Rewards Boxes */}
        <div className="mt-6 flex flex-col items-center space-y-4 w-full max-w-4xl px-4 pixel-font">
          <div className="p-4 rounded-lg bg-white shadow-lg w-full max-w-md text-center">
            <h2 className="text-lg font-bold text-center mb-2 text-blue-800">
              Your Balance
            </h2>
            <div className="text-center text-xl font-bold text-green-600">
              {parseFloat(userBalance) / 1e18} Kairu
            </div>
          </div>

          <div className="p-4 rounded-lg bg-white shadow-lg w-full max-w-md text-center">
            <h2 className="text-lg font-bold text-center mb-2 text-blue-800">
              Pending Rewards
            </h2>
            <div className="text-center text-xl font-bold text-green-600 mb-2">
              {parseFloat(pendingRewards).toFixed(6)} ETH
            </div>
            <button
              className="w-full bg-[#36A8FE] text-white rounded-lg py-1"
              onClick={handleClaimRewards}
              disabled={claimLoading || parseFloat(pendingRewards) === 0}
            >
              {claimLoading ? "Claiming..." : "Claim Rewards"}
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
