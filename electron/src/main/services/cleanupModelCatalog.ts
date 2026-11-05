// Official Qwen GGUF releases, pinned by revision and SHA-256. Sizes are download bytes.
export const CLEANUP_MODELS = [
  {
    "id": "qwen-1.5b",
    "label": "Qwen 2.5 \u00b7 1.5B",
    "ramGiB": 6,
    "description": "Lightweight; better suited to simple requests.",
    "repo": "Qwen/Qwen2.5-1.5B-Instruct-GGUF",
    "revision": "91cad51170dc346986eccefdc2dd33a9da36ead9",
    "files": [
      {
        "name": "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "bytes": 1117320736,
        "sha256": "6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e"
      }
    ]
  },
  {
    "id": "qwen-3b",
    "label": "Qwen 2.5 \u00b7 3B",
    "ramGiB": 8,
    "description": "Balanced size and speed.",
    "repo": "Qwen/Qwen2.5-3B-Instruct-GGUF",
    "revision": "7dabda4d13d513e3e842b20f0d435c732f172cbe",
    "files": [
      {
        "name": "qwen2.5-3b-instruct-q4_k_m.gguf",
        "bytes": 2104932768,
        "sha256": "626b4a6678b86442240e33df819e00132d3ba7dddfe1cdc4fbb18e0a9615c62d"
      }
    ]
  },
  {
    "id": "qwen-7b",
    "label": "Qwen 2.5 \u00b7 7B",
    "ramGiB": 12,
    "description": "Recommended for technical summaries; slower than small models.",
    "repo": "Qwen/Qwen2.5-7B-Instruct-GGUF",
    "revision": "bb5d59e06d9551d752d08b292a50eb208b07ab1f",
    "files": [
      {
        "name": "qwen2.5-7b-instruct-q4_k_m-00001-of-00002.gguf",
        "bytes": 3993201344,
        "sha256": "dfce12e3862a5283ccfb88221b48480e58745165de856439950d0f22590580db"
      },
      {
        "name": "qwen2.5-7b-instruct-q4_k_m-00002-of-00002.gguf",
        "bytes": 689872288,
        "sha256": "539cf93f78e887edea1c04e2d7d8cdaca9d01dae9c9025bcb8accbe29df3d72a"
      }
    ]
  },
  {
    "id": "qwen-14b",
    "label": "Qwen 2.5 \u00b7 14B",
    "ramGiB": 16,
    "description": "Largest option; heavily quantized to stay under 8 GB. Requires more memory and time.",
    "repo": "Qwen/Qwen2.5-14B-Instruct-GGUF",
    "revision": "b466e1f8c07172155743e8e1307507d8a4f91fbd",
    "files": [
      {
        "name": "qwen2.5-14b-instruct-q3_k_m-00001-of-00002.gguf",
        "bytes": 4000429472,
        "sha256": "3f38798df3987883b1b37c923e6a98fbfebc88cff2d94743e9935baccf1d19ad"
      },
      {
        "name": "qwen2.5-14b-instruct-q3_k_m-00002-of-00002.gguf",
        "bytes": 3338774688,
        "sha256": "fee42fd8be1b06f48c2e2313bfa09116446f56efded331543303a4642ba875ad"
      }
    ]
  }
] as const;
export function cleanupModel(id?: string) {
  const model = CLEANUP_MODELS.find(item => item.id === (!id || id === "qwen-0.5b" ? "qwen-1.5b" : id));
  if (!model) throw new Error("Unknown cleanup model. Choose a built-in model again.");
  return model;
}
