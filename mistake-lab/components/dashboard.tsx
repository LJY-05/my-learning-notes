"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  Plus,
  Sparkles,
  Bookmark,
  Check,
  RotateCcw,
} from "lucide-react";
import { useLab } from "./store";
import { today } from "@/lib/data";
export function Dashboard() {
  const { data } = useLab();
  const due = data.questions.filter(
    (q) => q.status !== "已掌握" && q.due <= today(),
  );
  const mastered = data.questions.filter((q) => q.status === "已掌握").length;
  const books = [
    ...new Set([
      ...data.pages.map((p) => p.book),
      ...data.questions.map((q) => q.book),
    ]),
  ].slice(0, 3);
  const recent = data.questions.slice(-3).reverse();
  const date = new Date().toLocaleDateString("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "long",
    day: "numeric",
    weekday: "long",
  });
  const firstPage = data.pages[0];
  return (
    <div className="study-desk">
      <div className="desk-dateline">
        <span>
          <i />
          今天，也留一点时间给自己。
        </span>
        <time dateTime={today()}>{date}</time>
      </div>
      <section className="desk-hero">
        <div className="desk-hero-copy">
          <span className="desk-greeting">欢迎回到你的学习实验室</span>
          <h1>
            把错题，
            <br />
            变成你的拿手题。
          </h1>
          <p>
            收藏一次疑问，读懂一个为什么。
            <br />
            下一次遇见，你会有新的答案。
          </p>
          <div className="desk-hero-actions">
            <Link href="/review" className="button primary">
              开始今日复习
              <ArrowRight size={17} />
            </Link>
            <Link href="/reader" className="desk-secondary">
              <BookOpen size={17} />
              打开原书
            </Link>
          </div>
          <div className="desk-revisit">
            <span className="desk-dot-pattern" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span>
              {due.length
                ? `${due.length} 道题，等你再看一眼。`
                : "今天的复习已完成，去发现新的问题。"}
            </span>
          </div>
        </div>
        <div className="desk-still-life">
          <span className="still-life-note">
            Make room
            <br />
            for a new thought.
          </span>
          <Link
            href={
              firstPage
                ? `/reader?page=${encodeURIComponent(firstPage.id)}`
                : "/reader"
            }
            className="hero-book hero-book-back"
            aria-label="打开原书阅读器"
          >
            <span className="cover-small">我的学习手册</span>
            <strong>
              那些
              <br />
              想明白的
              <br />
              小事。
            </strong>
            <span className="cover-orbit" aria-hidden="true" />
            <span className="cover-bottom">
              MISTAKE LAB <ArrowUpRight size={18} />
            </span>
          </Link>
          <Link href="/library" className="hero-note-card">
            <Bookmark size={20} strokeWidth={1.3} />
            <span>留住灵光一现</span>
            <strong>
              {String(data.questions.length).padStart(2, "0")}
              <small>个学习发现</small>
            </strong>
            <span className="note-lines" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <ArrowUpRight size={17} />
          </Link>
          <div className="discovery-seal" aria-hidden="true">
            <Sparkles size={25} strokeWidth={1.1} />
            <span>每天，一点新发现</span>
          </div>
        </div>
      </section>
      <section className="desk-progress" aria-label="学习统计">
        <div>
          <span className="progress-icon">
            <BookOpen size={18} />
          </span>
          <p>
            收集的错题
            <strong>
              {data.questions.length}
              <small>道</small>
            </strong>
          </p>
        </div>
        <div>
          <span className="progress-icon">
            <RotateCcw size={18} />
          </span>
          <p>
            今天再看一眼
            <strong>
              {due.length}
              <small>道待复习</small>
            </strong>
          </p>
        </div>
        <div>
          <span className="progress-icon">
            <Check size={18} />
          </span>
          <p>
            已经拿手的
            <strong>
              {mastered}
              <small>道已掌握</small>
            </strong>
          </p>
        </div>
        <Link href="/review" aria-label="查看复习计划">
          <ArrowUpRight size={23} />
        </Link>
      </section>
      <section className="desk-books-section">
        <div className="desk-section-heading">
          <div>
            <span>继续探索</span>
            <h2>你的书桌。</h2>
          </div>
          <Link href="/import" className="desk-text-link">
            带一本新书来
            <Plus size={17} />
          </Link>
        </div>
        <div className="desk-books">
          {books.map((book, index) => {
            const pages = data.pages.filter((p) => p.book === book),
              questions = data.questions.filter((q) => q.book === book);
            const subject =
              pages[0]?.subject || questions[0]?.subject || "学习";
            return (
              <Link
                className={`desk-book-card book-tone-${index}`}
                href={
                  pages.length
                    ? `/reader?page=${encodeURIComponent(pages[0].id)}`
                    : `/library?book=${encodeURIComponent(book)}`
                }
                key={book}
              >
                <div className="shelf-book-cover">
                  <span className="shelf-subject">
                    {subject}
                    <span>{pages.length ? "原书" : "错题集"}</span>
                  </span>
                  <h3>
                    {book.split("·").map((part, i) => (
                      <span key={i}>{part.trim()}</span>
                    ))}
                  </h3>
                  <div className="book-cover-art" aria-hidden="true">
                    {index === 0 ? (
                      <span className="art-equation">
                        {subject === "数学" ? "ƒ(x)" : subject.slice(0, 1)}
                      </span>
                    ) : index === 1 ? (
                      <span className="art-circles">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      <span className="art-letter">
                        {subject === "英语" ? "Aa" : subject.slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <span className="shelf-cover-foot">
                    MISTAKE LAB <BookOpen size={16} />
                  </span>
                </div>
                <div className="shelf-caption">
                  <div>
                    <strong>{book}</strong>
                    <span>
                      {questions.length} 道错题
                      {pages.length
                        ? ` · ${pages.length} 页原书`
                        : " · 打开错题集"}
                    </span>
                  </div>
                  <span className="shelf-open">
                    <ArrowUpRight size={19} />
                  </span>
                </div>
              </Link>
            );
          })}
          <Link href="/import" className="desk-add-book">
            <span>
              <Plus size={30} strokeWidth={1} />
            </span>
            <strong>下一本，从这里开始。</strong>
            <p>
              带入 PDF 或答案解析
              <br />
              整理成自己的学习资料
            </p>
            <span className="desk-add-label">
              导入新资料
              <ArrowUpRight size={16} />
            </span>
          </Link>
        </div>
      </section>
      <div className="desk-bottom-grid">
        <section className="desk-recent">
          <div className="desk-section-heading">
            <div>
              <span>还记得这些问题吗</span>
              <h2>最近的发现。</h2>
            </div>
            <Link href="/library" className="desk-text-link">
              全部错题
              <ArrowUpRight size={17} />
            </Link>
          </div>
          {recent.length ? (
            recent.map((q, index) => (
              <Link
                key={q.id}
                href={`/question?id=${q.id}`}
                className="desk-question-row"
              >
                <span className={`desk-question-index row-tone-${index}`}>
                  {q.subject.slice(0, 1)}
                </span>
                <div>
                  <small>
                    {q.book} / {q.topic}
                  </small>
                  <h3>{q.title}</h3>
                </div>
                <span className="status">{q.status}</span>
                <ArrowUpRight size={17} />
              </Link>
            ))
          ) : (
            <p>还没有收集题目。打开一本书，留住第一个疑问。</p>
          )}
        </section>
        <Link href="/studio" className="desk-studio">
          <span className="studio-flower" aria-hidden="true">
            <Sparkles size={32} strokeWidth={1} />
          </span>
          <span className="studio-try-tag">AI Studio · 模拟体验</span>
          <h2>
            给思路，
            <br />
            开一扇窗。
          </h2>
          <p>
            试着换一个角度，
            <br />
            找到卡住的那一步。
          </p>
          <span className="studio-open">
            探索一道题
            <ArrowUpRight size={20} />
          </span>
        </Link>
      </div>
    </div>
  );
}
