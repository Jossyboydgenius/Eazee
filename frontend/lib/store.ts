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
  setPosts: (posts: ScheduledPost[]) => void;
  addPost: (post: ScheduledPost) => void;
  savePost: (post: ScheduledPost) => void;
  removePost: (id: string) => void;
  startEditingPost: (id: string) => void;
  clearEditingPost: () => void;
  addTransaction: (tx: CeloTransaction) => void;
  setTransactions: (transactions: CeloTransaction[]) => void;
  resetCompose: () => void;
}

type StoredPhoto = {
  id: string;
  preview: string;
};

type PhotosByAccount = Record<string, StoredPhoto[]>;

type ComposeDraftState = {
  productName: string;
  postType: string;
  brief: string;
  tone: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  generatedCaption: string;
  captionDraft: string;
};

type ScheduleDraftState = {
  sendTime: string;
  customDateTime: string;
  repeat: "one-time" | "daily" | "weekly" | "monthly";
  targets: string[];
  selectedGroups: string[];
};

const STORAGE_WA_ACCOUNTS_KEY = "eazee-wa-accounts";
const STORAGE_SELECTED_ACCOUNT_KEY = "eazee-selected-account";
const STORAGE_PHOTOS_BY_ACCOUNT_KEY = "eazee-photos-by-account";
const STORAGE_COMPOSE_DRAFT_KEY = "eazee-compose-draft";
const STORAGE_SCHEDULE_DRAFT_KEY = "eazee-schedule-draft";
const STORAGE_POSTS_KEY = "eazee-posts";
const STORAGE_TRANSACTIONS_KEY = "eazee-transactions";
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

function loadComposeDraft(): ComposeDraftState {
  const parsed = parseJson<Partial<ComposeDraftState>>(
    safeReadStorage(STORAGE_COMPOSE_DRAFT_KEY),
    {},
  );

  return {
    productName: String(parsed.productName || ""),
    postType: String(parsed.postType || ""),
    brief: String(parsed.brief || ""),
    tone: String(parsed.tone || ""),
    hasCeloPayment: Boolean(parsed.hasCeloPayment),
    price: String(parsed.price || ""),
    currency: String(parsed.currency || "cUSD"),
    generatedCaption: String(parsed.generatedCaption || ""),
    captionDraft: String(parsed.captionDraft || ""),
  };
}

function persistComposeDraft(draft: ComposeDraftState): void {
  safeWriteStorage(STORAGE_COMPOSE_DRAFT_KEY, JSON.stringify(draft));
}

function loadScheduleDraft(): ScheduleDraftState {
  const parsed = parseJson<Partial<ScheduleDraftState>>(
    safeReadStorage(STORAGE_SCHEDULE_DRAFT_KEY),
    {},
  );

  return {
    sendTime: String(parsed.sendTime || ""),
    customDateTime: String(parsed.customDateTime || ""),
    repeat:
      parsed.repeat === "daily" ||
      parsed.repeat === "weekly" ||
      parsed.repeat === "monthly"
        ? parsed.repeat
        : "one-time",
    targets: Array.isArray(parsed.targets)
      ? parsed.targets.map((value) => String(value || "")).filter(Boolean)
      : [],
    selectedGroups: Array.isArray(parsed.selectedGroups)
      ? parsed.selectedGroups
          .map((value) => String(value || ""))
          .filter(Boolean)
      : [],
  };
}

function persistScheduleDraft(draft: ScheduleDraftState): void {
  safeWriteStorage(STORAGE_SCHEDULE_DRAFT_KEY, JSON.stringify(draft));
}

function pickComposeDraftFromStore(state: {
  productName: string;
  postType: string;
  brief: string;
  tone: string;
  hasCeloPayment: boolean;
  price: string;
  currency: string;
  generatedCaption: string;
  captionDraft: string;
}): ComposeDraftState {
  return {
    productName: state.productName,
    postType: state.postType,
    brief: state.brief,
    tone: state.tone,
    hasCeloPayment: state.hasCeloPayment,
    price: state.price,
    currency: state.currency,
    generatedCaption: state.generatedCaption,
    captionDraft: state.captionDraft,
  };
}

function pickScheduleDraftFromStore(state: {
  sendTime: string;
  customDateTime: string;
  repeat: "one-time" | "daily" | "weekly" | "monthly";
  targets: string[];
  selectedGroups: string[];
}): ScheduleDraftState {
  return {
    sendTime: state.sendTime,
    customDateTime: state.customDateTime,
    repeat: state.repeat,
    targets: state.targets,
    selectedGroups: state.selectedGroups,
  };
}

function loadPosts(): ScheduledPost[] {
  const parsed = parseJson<unknown[]>(safeReadStorage(STORAGE_POSTS_KEY), []);
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((entry): entry is Record<string, unknown> => {
      return Boolean(entry && typeof entry === "object");
    })
    .map((entry) => ({
      id: String(entry.id || ""),
      photos: Array.isArray(entry.photos)
        ? entry.photos.map((value) => String(value || "")).filter(Boolean)
        : [],
      productName: String(entry.productName || ""),
      postType: String(entry.postType || ""),
      brief: String(entry.brief || ""),
      tone: String(entry.tone || ""),
      caption: String(entry.caption || ""),
      templateName:
        typeof entry.templateName === "string" ? entry.templateName : undefined,
      templateLanguageCode:
        typeof entry.templateLanguageCode === "string"
          ? entry.templateLanguageCode
          : undefined,
      templateBodyParameters: Array.isArray(entry.templateBodyParameters)
        ? entry.templateBodyParameters
            .map((value) => String(value || "").trim())
            .filter(Boolean)
        : undefined,
      templateHeaderImageUrl:
        typeof entry.templateHeaderImageUrl === "string"
          ? entry.templateHeaderImageUrl
          : undefined,
      hasCeloPayment: Boolean(entry.hasCeloPayment),
      price: String(entry.price || ""),
      currency: String(entry.currency || "cUSD"),
      waAccount: String(entry.waAccount || ""),
      sendTime: String(entry.sendTime || ""),
      repeat:
        entry.repeat === "daily" ||
        entry.repeat === "weekly" ||
        entry.repeat === "monthly"
          ? entry.repeat
          : "one-time",
      targets: Array.isArray(entry.targets)
        ? entry.targets.map((value) => String(value || "")).filter(Boolean)
        : [],
      groups: Array.isArray(entry.groups)
        ? entry.groups.map((value) => String(value || "")).filter(Boolean)
        : [],
      status:
        entry.status === "sent" || entry.status === "failed"
          ? entry.status
          : "upcoming",
      createdAt: String(entry.createdAt || new Date().toISOString()),
    }))
    .filter((post) => Boolean(post.id));
}

function persistPosts(posts: ScheduledPost[]): void {
  safeWriteStorage(STORAGE_POSTS_KEY, JSON.stringify(posts));
}

function loadTransactions(): CeloTransaction[] {
  const parsed = parseJson<unknown[]>(
    safeReadStorage(STORAGE_TRANSACTIONS_KEY),
    [],
  );
  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter((entry): entry is Record<string, unknown> => {
      return Boolean(entry && typeof entry === "object");
    })
    .map((entry) => ({
      id: String(entry.id || ""),
      txHash: String(entry.txHash || ""),
      buyer: String(entry.buyer || ""),
      productName: String(entry.productName || "Payment"),
      amount: String(entry.amount || "0"),
      currency: String(entry.currency || "cUSD"),
      escrowStatus:
        entry.escrowStatus === "confirmed" || entry.escrowStatus === "refunded"
          ? entry.escrowStatus
          : "pending",
      timestamp: String(entry.timestamp || new Date().toISOString()),
    }))
    .filter((tx) => Boolean(tx.id || tx.txHash));
}

function persistTransactions(transactions: CeloTransaction[]): void {
  safeWriteStorage(STORAGE_TRANSACTIONS_KEY, JSON.stringify(transactions));
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
const initialComposeDraft = loadComposeDraft();
const initialScheduleDraft = loadScheduleDraft();
const initialPosts = loadPosts();
const initialTransactions = loadTransactions();

export const useEazeeStore = create<EazeeStore>((set) => ({
  photos: initialPhotos,
  productName: initialComposeDraft.productName,
  postType: initialComposeDraft.postType,
  brief: initialComposeDraft.brief,
  tone: initialComposeDraft.tone,
  hasCeloPayment: initialComposeDraft.hasCeloPayment,
  price: initialComposeDraft.price,
  currency: initialComposeDraft.currency,
  generatedCaption: initialComposeDraft.generatedCaption,
  captionDraft: initialComposeDraft.captionDraft,
  isGenerating: false,
  selectedAccount: initialSelectedAccount,
  sendTime: initialScheduleDraft.sendTime,
  customDateTime: initialScheduleDraft.customDateTime,
  repeat: initialScheduleDraft.repeat,
  targets: initialScheduleDraft.targets,
  selectedGroups: initialScheduleDraft.selectedGroups,
  posts: initialPosts,
  editingPostId: null,
  transactions: initialTransactions,
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
  setProductName: (productName) =>
    set((s) => {
      const nextState = { ...s, productName };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { productName };
    }),
  setPostType: (postType) =>
    set((s) => {
      const nextState = { ...s, postType };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { postType };
    }),
  setBrief: (brief) =>
    set((s) => {
      const nextState = { ...s, brief };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { brief };
    }),
  setTone: (tone) =>
    set((s) => {
      const nextState = { ...s, tone };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { tone };
    }),
  setHasCeloPayment: (hasCeloPayment) =>
    set((s) => {
      const nextState = { ...s, hasCeloPayment };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { hasCeloPayment };
    }),
  setPrice: (price) =>
    set((s) => {
      const nextState = { ...s, price };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { price };
    }),
  setCurrency: (currency) =>
    set((s) => {
      const nextState = { ...s, currency };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { currency };
    }),
  setGeneratedCaption: (generatedCaption) =>
    set((s) => {
      const nextState = { ...s, generatedCaption };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { generatedCaption };
    }),
  setCaptionDraft: (captionDraft) =>
    set((s) => {
      const nextState = { ...s, captionDraft };
      persistComposeDraft(pickComposeDraftFromStore(nextState));
      return { captionDraft };
    }),
  setIsGenerating: (isGenerating) => set({ isGenerating }),
  setSelectedAccount: (selectedAccount) =>
    set(() => {
      persistSelectedAccount(selectedAccount);
      return {
        selectedAccount,
        photos: loadPhotosForAccount(selectedAccount),
      };
    }),
  setSendTime: (sendTime) =>
    set((s) => {
      const nextState = { ...s, sendTime };
      persistScheduleDraft(pickScheduleDraftFromStore(nextState));
      return { sendTime };
    }),
  setCustomDateTime: (customDateTime) =>
    set((s) => {
      const nextState = { ...s, customDateTime };
      persistScheduleDraft(pickScheduleDraftFromStore(nextState));
      return { customDateTime };
    }),
  setRepeat: (repeat) =>
    set((s) => {
      const nextState = { ...s, repeat };
      persistScheduleDraft(pickScheduleDraftFromStore(nextState));
      return { repeat };
    }),
  setTargets: (targets) =>
    set((s) => {
      const nextState = { ...s, targets };
      persistScheduleDraft(pickScheduleDraftFromStore(nextState));
      return { targets };
    }),
  setSelectedGroups: (selectedGroups) =>
    set((s) => {
      const nextState = { ...s, selectedGroups };
      persistScheduleDraft(pickScheduleDraftFromStore(nextState));
      return { selectedGroups };
    }),
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
  setPosts: (posts) =>
    set(() => {
      persistPosts(posts);
      return { posts };
    }),
  addPost: (post) =>
    set((s) => {
      const posts = [post, ...s.posts];
      persistPosts(posts);
      return { posts };
    }),
  savePost: (post) =>
    set((s) => {
      const exists = s.posts.some((item) => item.id === post.id);
      const posts = exists
        ? s.posts.map((item) => (item.id === post.id ? post : item))
        : [post, ...s.posts];

      persistPosts(posts);

      return {
        posts,
        editingPostId: null,
      };
    }),
  removePost: (id) =>
    set((s) => {
      const posts = s.posts.filter((post) => post.id !== id);
      persistPosts(posts);

      return {
        posts,
        editingPostId: s.editingPostId === id ? null : s.editingPostId,
      };
    }),
  startEditingPost: (id) =>
    set((s) => {
      const post = s.posts.find((item) => item.id === id);
      if (!post) {
        return s;
      }

      const composeDraft: ComposeDraftState = {
        productName: post.productName,
        postType: post.postType,
        brief: post.brief,
        tone: post.tone,
        hasCeloPayment: post.hasCeloPayment,
        price: post.price,
        currency: post.currency,
        generatedCaption: post.caption,
        captionDraft: post.caption,
      };
      const scheduleDraft: ScheduleDraftState = {
        sendTime: post.sendTime,
        customDateTime: "",
        repeat: post.repeat,
        targets: post.targets,
        selectedGroups: post.groups,
      };

      persistComposeDraft(composeDraft);
      persistScheduleDraft(scheduleDraft);

      return {
        editingPostId: id,
        productName: composeDraft.productName,
        postType: composeDraft.postType,
        brief: composeDraft.brief,
        tone: composeDraft.tone,
        generatedCaption: composeDraft.generatedCaption,
        captionDraft: composeDraft.captionDraft,
        hasCeloPayment: composeDraft.hasCeloPayment,
        price: composeDraft.price,
        currency: composeDraft.currency,
        selectedAccount: post.waAccount,
        photos: loadPhotosForAccount(post.waAccount),
        sendTime: scheduleDraft.sendTime,
        customDateTime: scheduleDraft.customDateTime,
        repeat: scheduleDraft.repeat,
        targets: scheduleDraft.targets,
        selectedGroups: scheduleDraft.selectedGroups,
      };
    }),
  clearEditingPost: () => set({ editingPostId: null }),
  addTransaction: (tx) =>
    set((s) => {
      const transactions = [tx, ...s.transactions];
      persistTransactions(transactions);
      return { transactions };
    }),
  setTransactions: (transactions) =>
    set(() => {
      persistTransactions(transactions);
      return { transactions };
    }),
  resetCompose: () =>
    set((s) => {
      persistPhotosForAccount(s.selectedAccount, []);
      persistComposeDraft({
        productName: "",
        postType: "",
        brief: "",
        tone: "",
        hasCeloPayment: false,
        price: "",
        currency: "cUSD",
        generatedCaption: "",
        captionDraft: "",
      });

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
