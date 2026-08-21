import type { PaperProfile } from "../image-pipeline";

export const PAPER_PROFILES = {
  softPaper: {
    id: "soft-paper",
    name: "柔和纸",
    baseColor: "#f4edda",
    grainAmount: 0.35,
    fiberAmount: 0.3,
    stainAmount: 0.08,
  },
  newsprint: {
    id: "newsprint",
    name: "新闻纸",
    baseColor: "#e4ddc6",
    grainAmount: 0.52,
    fiberAmount: 0.42,
    stainAmount: 0.16,
  },
  recycled: {
    id: "recycled",
    name: "再生纸",
    baseColor: "#ded4b8",
    grainAmount: 0.64,
    fiberAmount: 0.52,
    stainAmount: 0.18,
  },
  coolWhite: {
    id: "cool-white",
    name: "冷白纸",
    baseColor: "#edf0e8",
    grainAmount: 0.28,
    fiberAmount: 0.22,
    stainAmount: 0.04,
  },
  photoPaper: {
    id: "photo-paper",
    name: "照片白纸",
    baseColor: "#ffffff",
    grainAmount: 0.03,
    fiberAmount: 0.02,
    stainAmount: 0,
  },
  warmPoster: {
    id: "warm-poster-paper",
    name: "暖黄海报纸",
    baseColor: "#f0ddb3",
    grainAmount: 0.42,
    fiberAmount: 0.35,
    stainAmount: 0.1,
  },
} satisfies Record<string, PaperProfile>;
