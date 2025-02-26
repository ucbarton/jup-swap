const config = {
  inputMint: "So11111111111111111111111111111111111111112", // Какой токен свапаем (SOL)
  outputMint: "1Qf8gESP4i6CFNWerUSDdLKJ9U1LpqTYvjJ2MM4pain", // На какой токен свапаем (PAIN)
  amountRange: "0.01-0.05", // Диапазон суммы в SOL
  minDelay: 6000, // Минимальная задержка между свапами в миллисекундах
  maxDelay: 15000, // Максимальная задержка между свапами в миллисекундах
  maxLamports: 0.001, // Максимальное количество SOL для приоритета (можно не трогать)
  priorityLevel: "high", // Уровень приоритета (medium || high || veryHigh)
  maxRetries: 3, // Максимальное количество попыток свапа
};

export default config;
