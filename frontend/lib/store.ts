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
  templateName?: string;
  templateLanguageCode?: string;
  templateBodyParameters?: string[];
  templateHeaderImageUrl?: string;
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
  captionDraft: string;
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
  setCaptionDraft: (caption: string) => void;
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

type StoredPhoto = {
  id: string;
  preview: string;
};

type PhotosByAccount = Record<string, StoredPhoto[]>;

const STORAGE_WA_ACCOUNTS_KEY = "eazee-wa-accounts";
const STORAGE_SELECTED_ACCOUNT_KEY = "eazee-selected-account";
const STORAGE_PHOTOS_BY_ACCOUNT_KEY = "eazee-photos-by-account";
const DEFAULT_ACCOUNT_STORAGE_KEY = "__default__";
const LEGACY_SEEDED_ACCOUNT_KEYS = new Set([
  "main business|+2348012345678",
  "sales line|+2349023456789",
]);

function canUseBrowserStorage(): boolean {
  return (
    typeof window !== "undefined" && typeof window.localStorage !== "undefined"
  );
}

function safeReadStorage(key: string): string | null {
  if (!canUseBrowserStorage()) return null;

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteStorage(key: string, value: string): void {
  if (!canUseBrowserStorage()) return;

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage errors (quota/private mode)
  }
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function normalizePhoneForKey(value: string): string {
  return value.replace(/[^\d+]/g, "").trim();
}

function isLegacySeededAccount(account: WAAccount): boolean {
  const label = account.label.trim().toLowerCase();
  const number = normalizePhoneForKey(account.number);
  return LEGACY_SEEDED_ACCOUNT_KEYS.has(`${label}|${number}`);
}

function getAccountStorageKey(accountId: string): string {
  const trimmed = accountId.trim();
  return trimmed || DEFAULT_ACCOUNT_STORAGE_KEY;
}

function buildPlaceholderFile(preview: string, index: number): File {
  const mimeMatch = /^data:([^;]+);/i.exec(preview);
  const mime = mimeMatch?.[1] || "image/jpeg";
  const extension = mime.includes("png")
    ? "png"
    : mime.includes("webp")
      ? "webp"
      : "jpg";

  if (typeof File !== "undefined") {
    return new File([], `draft-${index + 1}.${extension}`, { type: mime });
  }

  return { name: `draft-${index + 1}.${extension}`, type: mime } as File;
}

function toStoredPhotos(photos: UploadedPhoto[]): StoredPhoto[] {
  return photos
    .map((photo) => ({
      id: String(photo.id || ""),
      preview: String(photo.preview || ""),
    }))
    .filter((photo) => Boolean(photo.id && photo.preview))
    .slice(0, 6);
}

function toUploadedPhotos(photos: StoredPhoto[]): UploadedPhoto[] {
  return photos
    .filter((photo) => Boolean(photo.id && photo.preview))
    .map((photo, index) => ({
      id: photo.id,
      preview: photo.preview,
      file: buildPlaceholderFile(photo.preview, index),
    }));
}

function loadWaAccounts(): WAAccount[] {
  const parsed = parseJson<unknown[]>(
    safeReadStorage(STORAGE_WA_ACCOUNTS_KEY),
    [],
  );
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((entry): entry is WAAccount => {
      if (!entry || typeof entry !== "object") return false;
      const account = entry as WAAccount;
      return Boolean(account.id && account.label && account.number);
    })
    .map((account) => ({
      id: String(account.id),
      label: String(account.label),
      number: String(account.number),
    }))
    .filter((account) => !isLegacySeededAccount(account));
}

function persistWaAccounts(accounts: WAAccount[]): void {
  safeWriteStorage(STORAGE_WA_ACCOUNTS_KEY, JSON.stringify(accounts));
}

function loadSelectedAccount(): string {
  return (safeReadStorage(STORAGE_SELECTED_ACCOUNT_KEY) || "").trim();
}

function persistSelectedAccount(accountId: string): void {
  safeWriteStorage(STORAGE_SELECTED_ACCOUNT_KEY, accountId.trim());
}

function loadPhotosByAccount(): PhotosByAccount {
  const parsed = parseJson<PhotosByAccount>(
    safeReadStorage(STORAGE_PHOTOS_BY_ACCOUNT_KEY),
    {},
  );
  if (!parsed || typeof parsed !== "object") return {};
  return parsed;
}

function persistPhotosByAccount(map: PhotosByAccount): void {
  safeWriteStorage(STORAGE_PHOTOS_BY_ACCOUNT_KEY, JSON.stringify(map));
}

function loadPhotosForAccount(accountId: string): UploadedPhoto[] {
  const key = getAccountStorageKey(accountId);
  const map = loadPhotosByAccount();
  const stored = Array.isArray(map[key]) ? map[key] : [];
  return toUploadedPhotos(stored);
}

function persistPhotosForAccount(
  accountId: string,
  photos: UploadedPhoto[],
): void {
  const key = getAccountStorageKey(accountId);
  const map = loadPhotosByAccount();
  map[key] = toStoredPhotos(photos);
  persistPhotosByAccount(map);
}

function resolveInitialSelectedAccount(accounts: WAAccount[]): string {
  const stored = loadSelectedAccount();
  if (stored && accounts.some((account) => account.id === stored)) {
    return stored;
  }

  return accounts[0]?.id || "";
}

const initialWaAccounts = loadWaAccounts();
const initialSelectedAccount = resolveInitialSelectedAccount(initialWaAccounts);
const initialPhotos = loadPhotosForAccount(initialSelectedAccount);

export const useEazeeStore = create<EazeeStore>((set) => ({
  photos: initialPhotos,
  productName: "",
  postType: "",
  brief: "",
  tone: "",
  hasCeloPayment: false,
  price: "",
  currency: "cUSD",
  generatedCaption: "",
  captionDraft: "",
  isGenerating: false,
  selectedAccount: initialSelectedAccount,
  sendTime: "",
  customDateTime: "",
  repeat: "one-time",
  targets: [],
  selectedGroups: [],
  posts: [],
  editingPostId: null,
  transactions: [],
  waAccounts: initialWaAccounts,

  setPhotos: (photos) =>
    set((s) => {
      persistPhotosForAccount(s.selectedAccount, photos);
      return { photos };
    }),
  addPhoto: (photo) =>
    set((s) => {
      const photos = [...s.photos, photo];
      persistPhotosForAccount(s.selectedAccount, photos);
      return { photos };
    }),
  removePhoto: (id) =>
    set((s) => {
      const photos = s.photos.filter((p) => p.id !== id);
      persistPhotosForAccount(s.selectedAccount, photos);
      return { photos };
    }),
  setProductName: (productName) => set({ productName }),
  setPostType: (postType) => set({ postType }),
  setBrief: (brief) => set({ brief }),
  setTone: (tone) => set({ tone }),
  setHasCeloPayment: (hasCeloPayment) => set({ hasCeloPayment }),
  setPrice: (price) => set({ price }),
  setCurrency: (currency) => set({ currency }),
  setGeneratedCaption: (generatedCaption) => set({ generatedCaption }),
  setCaptionDraft: (captionDraft) => set({ captionDraft }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedAccount: (selectedAccount) =>
    set(() => {
      persistSelectedAccount(selectedAccount);
      return {
        selectedAccount,
        photos: loadPhotosForAccount(selectedAccount),
      };
    }),
  setSendTime: (sendTime) => set({ sendTime }),
  setCustomDateTime: (customDateTime) => set({ customDateTime }),
  setRepeat: (repeat) => set({ repeat }),
  setTargets: (targets) => set({ targets }),
  setSelectedGroups: (selectedGroups) => set({ selectedGroups }),
  addWAAccount: ({ label, number }) => {
    const id = `wa-${Date.now()}`;
    set((s) => {
      const waAccounts = [...s.waAccounts, { id, label, number }];
      persistWaAccounts(waAccounts);
      persistSelectedAccount(id);

      return {
        waAccounts,
        selectedAccount: id,
        photos: loadPhotosForAccount(id),
      };
    });
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
        captionDraft: post.caption,
        hasCeloPayment: post.hasCeloPayment,
        price: post.price,
        currency: post.currency,
        selectedAccount: post.waAccount,
        photos: loadPhotosForAccount(post.waAccount),
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
    set((s) => {
      persistPhotosForAccount(s.selectedAccount, []);

      return {
        photos: [],
        productName: "",
        postType: "",
        brief: "",
        tone: "",
        hasCeloPayment: false,
        price: "",
        currency: "cUSD",
        generatedCaption: "",
        captionDraft: "",
        isGenerating: false,
        editingPostId: null,
      };
    }),
}));
