import { create } from "zustand";

export interface UploadedPhoto {
  id: string;
  file: File;
  preview: string;
}

export interface ScheduledPost {
  id: string;
  photos: string[];
  productName: string;
  postType: string;
  brief: string;
  tone: string;
  caption: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  waAccount: string;
  sendTime: string;
  repeat: "one-time" | "daily" | "weekly" | "monthly";
  targets: string[];
  groups: string[];
  status: "upcoming" | "sent" | "failed";
  createdAt: string;
}

export interface CeloTransaction {
  id: string;
  txHash: string;
  buyer: string;
  productName: string;
  amount: string;
  currency: string;
  escrowStatus: "pending" | "confirmed" | "refunded";
  timestamp: string;
}

export interface WAAccount {
  id: string;
  number: string;
  label: string;
}

interface EazeeStore {
  // Compose state
  photos: UploadedPhoto[];
  productName: string;
  postType: string;
  brief: string;
  tone: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  generatedCaption: string;
  isGenerating: boolean;

  // Schedule state
  selectedAccount: string;
  sendTime: string;
  customDateTime: string;
  repeat: "one-time" | "daily" | "weekly" | "monthly";
  targets: string[];
  selectedGroups: string[];

  // Dashboard state
  posts: ScheduledPost[];
  editingPostId: string | null;
  transactions: CeloTransaction[];
  waAccounts: WAAccount[];

  // Actions
  setPhotos: (photos: UploadedPhoto[]) => void;
  addPhoto: (photo: UploadedPhoto) => void;
  removePhoto: (id: string) => void;
  setProductName: (name: string) => void;
  setPostType: (type: string) => void;
  setBrief: (brief: string) => void;
  setTone: (tone: string) => void;
  setHasCeloPayment: (val: boolean) => void;
  setPrice: (price: string) => void;
  setCurrency: (currency: string) => void;
  setGeneratedCaption: (caption: string) => void;
  setIsGenerating: (val: boolean) => void;
  setSelectedAccount: (id: string) => void;
  setSendTime: (time: string) => void;
  setCustomDateTime: (dt: string) => void;
  setRepeat: (val: "one-time" | "daily" | "weekly" | "monthly") => void;
  setTargets: (targets: string[]) => void;
  setSelectedGroups: (groups: string[]) => void;
  addWAAccount: (account: Omit<WAAccount, "id">) => string;
  addPost: (post: ScheduledPost) => void;
  savePost: (post: ScheduledPost) => void;
  removePost: (id: string) => void;
  startEditingPost: (id: string) => void;
  clearEditingPost: () => void;
  addTransaction: (tx: CeloTransaction) => void;
  resetCompose: () => void;
}

const MOCK_TRANSACTIONS: CeloTransaction[] = [
  {
    id: "1",
    txHash: "0xabc123def456789...",
    buyer: "0x742d35Cc6634C0532925a3b8D4C9...",
    productName: "Ankara Fabric Bundle",
    amount: "12.00",
    currency: "cUSD",
    escrowStatus: "confirmed",
    timestamp: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
  },
  {
    id: "2",
    txHash: "0xdef789abc123456...",
    buyer: "0x8F3d2a1B5c9E7f4...",
    productName: "Shea Butter (500g)",
    amount: "5.50",
    currency: "cUSD",
    escrowStatus: "pending",
    timestamp: new Date(Date.now() - 1000 * 60 * 10).toISOString(),
  },
];

const MOCK_ACCOUNTS: WAAccount[] = [
  { id: "1", number: "+234 801 234 5678", label: "Main Business" },
  { id: "2", number: "+234 902 345 6789", label: "Sales Line" },
];

const MOCK_POSTS: ScheduledPost[] = [
  {
    id: "1",
    photos: [],
    productName: "Ankara Fabric Bundle",
    postType: "product",
    brief: "New ankara fabrics collection",
    tone: "friendly",
    caption:
      "🎉 New Collection Alert! Our gorgeous Ankara Fabric Bundle is here! Perfect for that occasion look. Premium quality, authentic African prints. 💛\n\n📦 Order now and get free delivery within Lagos!\n\n💳 Pay with cUSD: $12.00\nTap Buy Now 👇",
    hasCeloPayment: true,
    price: "12.00",
    currency: "cUSD",
    waAccount: "1",
    sendTime: "17:00",
    repeat: "weekly",
    targets: ["status"],
    groups: [],
    status: "upcoming",
    createdAt: new Date().toISOString(),
  },
];

export const useEazeeStore = create<EazeeStore>((set) => ({
  photos: [],
  productName: "",
  postType: "",
  brief: "",
  tone: "",
  hasCeloPayment: false,
  price: "",
  currency: "cUSD",
  generatedCaption: "",
  isGenerating: false,
  selectedAccount: "1",
  sendTime: "",
  customDateTime: "",
  repeat: "one-time",
  targets: [],
  selectedGroups: [],
  posts: MOCK_POSTS,
  editingPostId: null,
  transactions: MOCK_TRANSACTIONS,
  waAccounts: MOCK_ACCOUNTS,

  setPhotos: (photos) => set({ photos }),
  addPhoto: (photo) => set((s) => ({ photos: [...s.photos, photo] })),
  removePhoto: (id) =>
    set((s) => ({ photos: s.photos.filter((p) => p.id !== id) })),
  setProductName: (productName) => set({ productName }),
  setPostType: (postType) => set({ postType }),
  setBrief: (brief) => set({ brief }),
  setTone: (tone) => set({ tone }),
  setHasCeloPayment: (hasCeloPayment) => set({ hasCeloPayment }),
  setPrice: (price) => set({ price }),
  setCurrency: (currency) => set({ currency }),
  setGeneratedCaption: (generatedCaption) => set({ generatedCaption }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedAccount: (selectedAccount) => set({ selectedAccount }),
  setSendTime: (sendTime) => set({ sendTime }),
  setCustomDateTime: (customDateTime) => set({ customDateTime }),
  setRepeat: (repeat) => set({ repeat }),
  setTargets: (targets) => set({ targets }),
  setSelectedGroups: (selectedGroups) => set({ selectedGroups }),
  addWAAccount: ({ label, number }) => {
    const id = `wa-${Date.now()}`;
    set((s) => ({
      waAccounts: [...s.waAccounts, { id, label, number }],
      selectedAccount: id,
    }));
    return id;
  },
  addPost: (post) => set((s) => ({ posts: [post, ...s.posts] })),
  savePost: (post) =>
    set((s) => {
      const exists = s.posts.some((item) => item.id === post.id);
      return {
        posts: exists
          ? s.posts.map((item) => (item.id === post.id ? post : item))
          : [post, ...s.posts],
        editingPostId: null,
      };
    }),
  removePost: (id) =>
    set((s) => ({
      posts: s.posts.filter((post) => post.id !== id),
      editingPostId: s.editingPostId === id ? null : s.editingPostId,
    })),
  startEditingPost: (id) =>
    set((s) => {
      const post = s.posts.find((item) => item.id === id);
      if (!post) {
        return s;
      }

      return {
        editingPostId: id,
        productName: post.productName,
        postType: post.postType,
        brief: post.brief,
        tone: post.tone,
        generatedCaption: post.caption,
        hasCeloPayment: post.hasCeloPayment,
        price: post.price,
        currency: post.currency,
        selectedAccount: post.waAccount,
        sendTime: post.sendTime,
        customDateTime: "",
        repeat: post.repeat,
        targets: post.targets,
        selectedGroups: post.groups,
      };
    }),
  clearEditingPost: () => set({ editingPostId: null }),
  addTransaction: (tx) =>
    set((s) => ({ transactions: [tx, ...s.transactions] })),
  resetCompose: () =>
    set({
      photos: [],
      productName: "",
      postType: "",
      brief: "",
      tone: "",
      hasCeloPayment: false,
      price: "",
      currency: "cUSD",
      generatedCaption: "",
      isGenerating: false,
      editingPostId: null,
    }),
}));
