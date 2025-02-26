import {
  Connection,
  Keypair,
  PublicKey,
  VersionedTransaction,
} from "@solana/web3.js";
import { Wallet } from "@coral-xyz/anchor";
import bs58 from "bs58";
import fetch from "node-fetch";
import dotenv from "dotenv";
import fs from "fs";
import config from "./config.js";
import { HttpsProxyAgent } from "https-proxy-agent";

dotenv.config();

const connection = new Connection("https://api.mainnet-beta.solana.com");

function readPrivateKeysFromFile(filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  return data
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function readProxiesFromFile(filePath) {
  const data = fs.readFileSync(filePath, "utf8");
  return data
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

async function getQuote(inputMint, outputMint, amount, proxy) {
  const url = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50&restrictIntermediateTokens=true`;
  try {
    const response = await fetch(url, {
      agent: proxy,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return data;
  } catch (error) {
    console.error("Error fetching quote:", error);
    return null;
  }
}

async function performSwap(quoteResponse, wallet, proxy) {
  const url = "https://api.jup.ag/swap/v1/swap";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey: wallet.publicKey.toString(),
        dynamicComputeUnitLimit: true,
        dynamicSlippage: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            maxLamports: config.maxLamports * 1000000000,
            priorityLevel: config.priorityLevel,
          },
        },
      }),
      agent: proxy,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const swapResponse = await response.json();
    return swapResponse;
  } catch (error) {
    console.error("Error performing swap:", error);
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomAmount(amountRange) {
  const [min, max] = amountRange.split("-").map(Number);
  return Math.random() * (max - min) + min;
}

async function main() {
  const privateKeys = readPrivateKeysFromFile("privates.txt");
  const proxies = readProxiesFromFile("proxys.txt");

  if (privateKeys.length === 0 || proxies.length === 0) {
    console.log(
      "Нет доступных приватных ключей или прокси. Завершение работы."
    );
    return;
  }

  if (privateKeys.length !== proxies.length) {
    console.log(
      "Количество приватных ключей и прокси не совпадает. Завершение работы."
    );
    return;
  }

  console.log("✅ Приватные ключи и прокси загружены");

  const { inputMint, outputMint, amountRange, minDelay, maxDelay, maxRetries } =
    config;

  for (let i = 0; i < privateKeys.length; i++) {
    const privateKey = privateKeys[i];
    const proxyUrl = proxies[i];
    const proxy = new HttpsProxyAgent(proxyUrl);
    console.log(`🌐 Используем прокси: ${proxyUrl}`);

    const amount = getRandomAmount(amountRange);
    const amountInLamports = Math.floor(amount * 1_000_000_000);
    const quote = await getQuote(
      inputMint,
      outputMint,
      amountInLamports,
      proxy
    );
    if (quote) {
      const outputAmount = quote.outAmount / 1_000_000;
      console.log(
        `🔄 Получили котировку на свап ${amount.toFixed(
          9
        )} SOL на ${outputAmount.toFixed(9)} ${outputMint}`
      );

      const keypair = Keypair.fromSecretKey(bs58.decode(privateKey));
      const wallet = new Wallet(keypair);
      console.log("⚙️ Используем кошелек:", wallet.publicKey.toString());

      let success = false;
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const swapResponse = await performSwap(quote, wallet, proxy);
          if (swapResponse) {
            const transactionBase64 = swapResponse.swapTransaction;
            const transaction = VersionedTransaction.deserialize(
              Buffer.from(transactionBase64, "base64")
            );

            transaction.sign([wallet.payer]);

            const transactionBinary = transaction.serialize();

            const signature = await connection.sendRawTransaction(
              transactionBinary,
              {
                maxRetries: 2,
                skipPreflight: true,
              }
            );
            console.log("✅ Транзакция отправлена!");

            const confirmation = await connection.confirmTransaction(
              { signature },
              "finalized"
            );

            if (confirmation.value.err) {
              throw new Error(
                `Transaction failed: ${JSON.stringify(
                  confirmation.value.err
                )}\nhttps://solscan.io/tx/${signature}/`
              );
            } else {
              console.log(
                `✅ Transaction successful: https://solscan.io/tx/${signature}/`
              );
              success = true;
              break;
            }
          } else {
            console.log("❌ Не удалось выполнить свап.");
          }
        } catch (error) {
          console.error(`Attempt ${attempt + 1} failed:`, error);
        }
      }

      if (!success) {
        console.log("❌ Все попытки выполнения свапа не удались.");
      }
    } else {
      console.log("❌ Не удалось получить квоту.");
    }

    const delay =
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
    console.log(`⌛️ Ожидание ${delay} миллисекунд перед следующим свапом...`);
    await sleep(delay);
  }

  console.log("🔑 Все приватные ключи обработаны. Завершение работы.");
}

main();
