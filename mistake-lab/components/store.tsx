"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  startTransition,
  type ReactNode,
} from "react";
import { seed, type LabData, today } from "@/lib/data";
import { upgradeData } from "@/lib/materials";
type Store = {
  data: LabData;
  setData: React.Dispatch<React.SetStateAction<LabData>>;
  ready: boolean;
  notify: (message: string) => void;
  toast: string;
  storageError: string;
  recordReview: (id: string, known: boolean) => void;
};
const Context = createContext<Store | null>(null);
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("mistake-lab", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("workspace");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function LabProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<LabData>(seed);
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const db = useRef<IDBDatabase | null>(null);
  useEffect(() => {
    let active = true;
    database()
      .then((database) => {
        if (!active) {
          database.close();
          return;
        }
        db.current = database;
        const request = database
          .transaction("workspace")
          .objectStore("workspace")
          .get("data");
        request.onsuccess = () => {
          if (active) {
            startTransition(() => {
              if (request.result?.version === 1)
                setData(upgradeData(request.result));
              setReady(true);
            });
          }
        };
        request.onerror = () => {
          setStorageError("无法读取本地数据，请检查浏览器存储权限。");
          setReady(true);
        };
      })
      .catch(() => {
        setStorageError("浏览器存储不可用，当前更改仅在本次会话保留。");
        setReady(true);
      });
    return () => {
      active = false;
      db.current?.close();
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  useEffect(() => {
    if (!ready || !db.current) return;
    try {
      const tx = db.current.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(data, "data");
      tx.onerror = () =>
        setStorageError("本地保存失败，可能空间不足。请导出备份后重试。");
      tx.oncomplete = () => setStorageError("");
    } catch {
      setStorageError("本地保存失败，请导出备份。");
    }
  }, [data, ready]);
  function notify(message: string) {
    setToast(message);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(""), 4000);
  }
  function recordReview(id: string, known: boolean) {
    setData((d) => {
      const date = today();
      const next = new Date();
      next.setDate(next.getDate() + (known ? 3 : 1));
      return {
        ...d,
        questions: d.questions.map((q) =>
          q.id === id
            ? {
                ...q,
                reviews: q.reviews + 1,
                status: known
                  ? q.reviews >= 1
                    ? "已掌握"
                    : "巩固中"
                  : "待复习",
                due: next.toLocaleDateString("en-CA", {
                  timeZone: "Asia/Shanghai",
                }),
              }
            : q,
        ),
        activity: d.activity.some((a) => a.date === date)
          ? d.activity.map((a) =>
              a.date === date ? { ...a, count: a.count + 1 } : a,
            )
          : [...d.activity, { date, count: 1 }],
      };
    });
  }
  return (
    <Context.Provider
      value={{
        data,
        setData,
        ready,
        notify,
        toast,
        storageError,
        recordReview,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useLab() {
  const value = useContext(Context);
  if (!value) throw Error("Missing LabProvider");
  return value;
}
