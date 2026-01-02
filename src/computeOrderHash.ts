import { TypedDataEncoder } from "ethers";
import fs from "fs";

interface EIP712TypedData {
  primaryType: string;
  types: Record<string, Array<{ name: string; type: string }>>;
  domain: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
    salt?: string;
  };
  message: Record<string, unknown>;
}

function computeOrderHash(typedData: EIP712TypedData): string {
  const { EIP712Domain, ...types } = typedData.types;

  const hash = TypedDataEncoder.hash(
    typedData.domain,
    types,
    typedData.message
  );

  return hash;
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: npx ts-node src/computeOrderHash.ts ./order.json>");
    process.exit(1);
  }

  const filePath = args[0];

  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  const typedData: EIP712TypedData = JSON.parse(fileContent);

  const orderHash = computeOrderHash(typedData);

  console.log("Order Hash:", orderHash);
}

main();
