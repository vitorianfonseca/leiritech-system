"use client";

import * as React from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { DirectoryUser } from "@/lib/api/collaboration-types";

export interface MentionInputProps {
  value: string;
  onValueChange: (value: string) => void;
  /** Recomputed from the text whenever it changes (users whose @name appears). */
  onMentionIdsChange?: (ids: string[]) => void;
  /** Directory used for @mention autocomplete. */
  users: DirectoryUser[];
  placeholder?: string;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
  minRows?: number;
  className?: string;
  /** Fired on Cmd/Ctrl+Enter (only when the mention menu is closed). */
  onSubmit?: () => void;
}

const MAX_SUGGESTIONS = 6;

/**
 * Users whose `@Full Name` token currently appears in the text.
 *
 * Matches are word-boundary aware and resolved longest-name-first: a matched
 * span is masked out before shorter names are tested, so "@Ana Silva" does not
 * spuriously flag a separate "Ana" user (prefix-name false positive). A token
 * must not be immediately followed by another name character, so "@Ana" won't
 * match inside "@AnaSilva" either.
 */
export function deriveMentionIds(text: string, users: DirectoryUser[]): string[] {
  const sorted = [...users].sort((a, b) => b.name.length - a.name.length);
  let working = text;
  const ids: string[] = [];

  for (const user of sorted) {
    const token = `@${user.name}`;
    let matched = false;
    let idx = working.indexOf(token);
    while (idx !== -1) {
      const after = working[idx + token.length];
      const isBoundary = after === undefined || !/[\p{L}\p{N}]/u.test(after);
      if (isBoundary) {
        matched = true;
        // Mask the span so a shorter (prefix) name can't re-match inside it.
        working =
          working.slice(0, idx) +
          " ".repeat(token.length) +
          working.slice(idx + token.length);
      }
      idx = working.indexOf(token, idx + 1);
    }
    if (matched) ids.push(user.id);
  }

  return [...new Set(ids)];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/**
 * Accessible textarea with inline @mention autocomplete. Typing `@` opens a
 * keyboard-navigable listbox of directory users; selecting one inserts
 * `@Full Name` and the mention set is re-derived from the text (so deleting the
 * token removes the mention). Consumes design tokens only; WCAG AA via
 * combobox/listbox aria wiring and visible focus.
 */
export function MentionInput({
  value,
  onValueChange,
  onMentionIdsChange,
  users,
  placeholder,
  disabled,
  id,
  "aria-label": ariaLabel,
  minRows = 3,
  className,
  onSubmit,
}: MentionInputProps) {
  const t = useTranslations("collaboration.mentionInput");
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);
  const listboxId = React.useId();

  const [menuOpen, setMenuOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [triggerStart, setTriggerStart] = React.useState<number | null>(null);
  const [activeIndex, setActiveIndex] = React.useState(0);

  const suggestions = React.useMemo(() => {
    if (!menuOpen) return [];
    const q = query.trim().toLowerCase();
    const matches = users.filter((u) => {
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
      );
    });
    return matches.slice(0, MAX_SUGGESTIONS);
  }, [menuOpen, query, users]);

  // Auto-grow to fit content without a scrollbar for short posts.
  const resize = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);

  React.useEffect(() => {
    resize();
  }, [value, resize]);

  const closeMenu = React.useCallback(() => {
    setMenuOpen(false);
    setTriggerStart(null);
    setQuery("");
    setActiveIndex(0);
  }, []);

  /** Detect an active `@query` immediately before the caret. */
  const syncMenu = React.useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const caret = el.selectionStart ?? 0;
    const upto = el.value.slice(0, caret);
    const at = upto.lastIndexOf("@");
    if (at === -1) {
      closeMenu();
      return;
    }
    const charBefore = at > 0 ? upto[at - 1] : " ";
    const isBoundary = at === 0 || /\s/.test(charBefore);
    const fragment = upto.slice(at + 1);
    // Close if the fragment already contains whitespace (mention committed).
    if (!isBoundary || /\s/.test(fragment)) {
      closeMenu();
      return;
    }
    setTriggerStart(at);
    setQuery(fragment);
    setActiveIndex(0);
    setMenuOpen(true);
  }, [closeMenu]);

  function emitChange(next: string) {
    onValueChange(next);
    onMentionIdsChange?.(deriveMentionIds(next, users));
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    emitChange(e.target.value);
    // Defer so selectionStart reflects the post-change caret.
    requestAnimationFrame(syncMenu);
  }

  function selectUser(user: DirectoryUser) {
    const el = textareaRef.current;
    if (el == null || triggerStart == null) return;
    const caret = el.selectionStart ?? el.value.length;
    const before = value.slice(0, triggerStart);
    const after = value.slice(caret);
    const token = `@${user.name} `;
    const next = `${before}${token}${after}`;
    emitChange(next);
    closeMenu();
    const nextCaret = before.length + token.length;
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      resize();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menuOpen && suggestions.length > 0) {
      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((i) => (i + 1) % suggestions.length);
          return;
        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
          return;
        case "Enter":
        case "Tab":
          e.preventDefault();
          selectUser(suggestions[activeIndex]);
          return;
        case "Escape":
          e.preventDefault();
          closeMenu();
          return;
      }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
    }
  }

  const activeOptionId =
    menuOpen && suggestions.length > 0
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        value={value}
        disabled={disabled}
        placeholder={placeholder ?? t("placeholder")}
        rows={minRows}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onClick={syncMenu}
        onBlur={() => {
          // Delay so an option click registers before the menu unmounts.
          window.setTimeout(closeMenu, 120);
        }}
        role="combobox"
        aria-label={ariaLabel ?? t("label")}
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? listboxId : undefined}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
        className={cn(
          "flex w-full min-w-0 resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm shadow-sm transition-[color,box-shadow] outline-none",
          "placeholder:text-muted-foreground",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40",
          "disabled:pointer-events-none disabled:opacity-50",
          className
        )}
      />

      {menuOpen && suggestions.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          aria-label={t("suggestionsLabel")}
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {suggestions.map((user, i) => (
            <li
              key={user.id}
              id={`${listboxId}-opt-${i}`}
              role="option"
              aria-selected={i === activeIndex}
              // onMouseDown (not onClick) fires before the textarea blur.
              onMouseDown={(e) => {
                e.preventDefault();
                selectUser(user);
              }}
              onMouseEnter={() => setActiveIndex(i)}
              className={cn(
                "flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none",
                i === activeIndex
                  ? "bg-accent text-accent-foreground"
                  : "text-foreground"
              )}
            >
              <Avatar className="size-7">
                {user.avatarUrl ? (
                  <AvatarImage src={user.avatarUrl} alt="" />
                ) : null}
                <AvatarFallback>{initials(user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
