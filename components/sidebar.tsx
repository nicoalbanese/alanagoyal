"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import SessionId from "./session-id";
import { Pin } from "lucide-react";
import { useRouter } from "next/navigation";
import { CommandMenu } from "./command-menu";
import { SidebarContent } from "./sidebar-content";
import SearchBar from "./search";
import { groupNotesByCategory, sortGroupedNotes } from "@/lib/note-utils";
import { createClient } from "@/utils/supabase/client";
import { Note } from "@/lib/types";
import { toast } from "./ui/use-toast";

const labels = {
  pinned: (
    <>
      <Pin className="inline-block w-4 h-4 mr-1" /> Pinned
    </>
  ),
  today: "Today",
  yesterday: "Yesterday",
  "7": "Previous 7 Days",
  "30": "Previous 30 Days",
  older: "Older",
};

const categoryOrder = ["pinned", "today", "yesterday", "7", "30", "older"];

export default function Sidebar({
  notes,
  onNoteSelect,
  isMobile,
}: {
  notes: any[];
  onNoteSelect: (note: any) => void;
  isMobile: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [sessionId, setSessionId] = useState("");
  const [selectedNoteSlug, setSelectedNoteSlug] = useState<string | null>(null);
  const [pinnedNotes, setPinnedNotes] = useState<Set<string>>(new Set());
  const pathname = usePathname();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [localSearchResults, setLocalSearchResults] = useState<any[] | null>(
    null
  );
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [groupedNotes, setGroupedNotes] = useState<any>({});
  const [selectedNote, setSelectedNote] = useState<Note | null>(null);
  const [openSwipeItemSlug, setOpenSwipeItemSlug] = useState<string | null>(
    null
  );
  const [highlightedNote, setHighlightedNote] = useState<Note | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const commandMenuRef = useRef<{ setOpen: (open: boolean) => void } | null>(
    null
  );

  useEffect(() => {
    if (pathname) {
      const slug = pathname.split("/").pop();
      setSelectedNoteSlug(slug || null);
    }
  }, [pathname]);

  useEffect(() => {
    if (selectedNoteSlug) {
      const note = notes.find((note) => note.slug === selectedNoteSlug);
      setSelectedNote(note || null);
    } else {
      setSelectedNote(null);
    }
  }, [selectedNoteSlug, notes]);

  useEffect(() => {
    const storedPinnedNotes = localStorage.getItem("pinnedNotes");
    if (storedPinnedNotes) {
      setPinnedNotes(new Set(JSON.parse(storedPinnedNotes)));
    } else {
      const initialPinnedNotes = new Set(
        notes
          .filter(
            (note) =>
              note.slug === "about-me" ||
              note.slug === "quick-links" ||
              note.session_id === sessionId
          )
          .map((note) => note.slug)
      );
      setPinnedNotes(initialPinnedNotes);
      localStorage.setItem(
        "pinnedNotes",
        JSON.stringify(Array.from(initialPinnedNotes))
      );
    }
  }, [notes, sessionId]);

  useEffect(() => {
    const userSpecificNotes = notes.filter(
      (note) => note.public || note.session_id === sessionId
    );
    const grouped = groupNotesByCategory(userSpecificNotes, pinnedNotes);
    sortGroupedNotes(grouped);
    setGroupedNotes(grouped);
  }, [notes, sessionId, pinnedNotes]);

  useEffect(() => {
    if (localSearchResults && localSearchResults.length > 0) {
      setHighlightedNote(localSearchResults[highlightedIndex]);
    } else {
      setHighlightedNote(selectedNote);
    }
  }, [localSearchResults, highlightedIndex, selectedNote]);

  const clearSearch = useCallback(() => {
    setLocalSearchResults(null);
    setSearchQuery("");
    setHighlightedIndex(0);
    if (searchInputRef.current) {
      searchInputRef.current.value = "";
    }
  }, [setLocalSearchResults, setHighlightedIndex]);

  const flattenedNotes = useCallback(() => {
    return categoryOrder.flatMap((category) =>
      groupedNotes[category] ? groupedNotes[category] : []
    );
  }, [groupedNotes]);

  const navigateNotes = useCallback(
    (direction: "up" | "down") => {
      if (!localSearchResults) {
        const flattened = flattenedNotes();
        const currentIndex = flattened.findIndex(
          (note) => note.slug === selectedNoteSlug
        );
        let nextIndex;

        if (direction === "up") {
          nextIndex =
            currentIndex > 0 ? currentIndex - 1 : flattened.length - 1;
        } else {
          nextIndex =
            currentIndex < flattened.length - 1 ? currentIndex + 1 : 0;
        }

        const nextNote = flattened[nextIndex];
        if (nextNote) {
          router.push(`/${nextNote.slug}`);
        }
      }
    },
    [flattenedNotes, selectedNoteSlug, router, localSearchResults]
  );

  const handlePinToggle = useCallback(
    (slug: string) => {
      setPinnedNotes((prev) => {
        const newPinned = new Set(prev);
        if (newPinned.has(slug)) {
          newPinned.delete(slug);
        } else {
          newPinned.add(slug);
        }
        localStorage.setItem(
          "pinnedNotes",
          JSON.stringify(Array.from(newPinned))
        );
        return newPinned;
      });

      clearSearch();

      if (!isMobile) {
        router.push(`/${slug}`);
      }
    },
    [router, isMobile, clearSearch]
  );

  const handleNoteDelete = useCallback(
    async (noteToDelete: Note) => {
      if (noteToDelete.public) {
        toast({
          description: "Oops! You can't delete that note",
        });
        return;
      }

      try {
        const { error } = await supabase
          .from("notes")
          .delete()
          .eq("slug", noteToDelete.slug)
          .eq("session_id", sessionId);

        if (error) throw error;

        setGroupedNotes((prevGroupedNotes: Record<string, Note[]>) => {
          const newGroupedNotes = { ...prevGroupedNotes };
          for (const category in newGroupedNotes) {
            newGroupedNotes[category] = newGroupedNotes[category].filter(
              (note: Note) => note.slug !== noteToDelete.slug
            );
          }
          return newGroupedNotes;
        });

        const allNotes = flattenedNotes();
        const deletedNoteIndex = allNotes.findIndex(
          (note) => note.slug === noteToDelete.slug
        );

        let nextNote;
        if (deletedNoteIndex === 0) {
          nextNote = allNotes[1];
        } else {
          nextNote = allNotes[deletedNoteIndex - 1];
        }

        if (!isMobile) {
          router.push(nextNote ? `/${nextNote.slug}` : "/about-me");
        }
        router.refresh();
      } catch (error) {
        console.error("Error deleting note:", error);
      }
    },
    [supabase, sessionId, flattenedNotes, router, isMobile]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping =
        target.isContentEditable ||
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT";

      if (isTyping && event.key === "Escape") {
        (target as HTMLElement).blur();
      } else if (!isTyping) {
        if (event.key === "j" || event.key === "ArrowDown") {
          (document.activeElement as HTMLElement)?.blur();
          event.preventDefault();
          if (localSearchResults) {
            setHighlightedIndex(
              (prevIndex) => (prevIndex + 1) % localSearchResults.length
            );
          } else {
            navigateNotes("down");
          }
        } else if (event.key === "k" && !event.metaKey || event.key === "ArrowUp") {
          (document.activeElement as HTMLElement)?.blur();
          event.preventDefault();
          if (localSearchResults) {
            setHighlightedIndex(
              (prevIndex) =>
                (prevIndex - 1 + localSearchResults.length) %
                localSearchResults.length
            );
          } else {
            navigateNotes("up");
          }
        } else if (event.key === "p" && !event.metaKey) {
          event.preventDefault();
          if (highlightedNote) {
            handlePinToggle(highlightedNote.slug);
          }
        } else if (event.key === "d" && !event.metaKey) {
          event.preventDefault();
          if (highlightedNote) {
            handleNoteDelete(highlightedNote);
          }
        } else if (event.key === "/") {
          event.preventDefault();
          searchInputRef.current?.focus();
        } else if (event.key === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          commandMenuRef.current?.setOpen(true);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [
    navigateNotes,
    highlightedNote,
    handlePinToggle,
    localSearchResults,
    setHighlightedIndex,
    handleNoteDelete,
    commandMenuRef,
  ]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <SessionId setSessionId={setSessionId} />
      <CommandMenu
        notes={notes}
        sessionId={sessionId}
        addNewPinnedNote={handlePinToggle}
        navigateNotes={navigateNotes}
        togglePinned={handlePinToggle}
        deleteNote={handleNoteDelete}
        highlightedNote={highlightedNote}
      />
      <div className="flex-1 overflow-y-auto">
        <SearchBar
          notes={notes}
          onSearchResults={setLocalSearchResults}
          sessionId={sessionId}
          inputRef={searchInputRef}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          setHighlightedIndex={setHighlightedIndex}
          clearSearch={clearSearch}
        />
        <SidebarContent
          groupedNotes={groupedNotes}
          selectedNoteSlug={selectedNoteSlug}
          onNoteSelect={onNoteSelect}
          notes={notes}
          sessionId={sessionId}
          handlePinToggle={handlePinToggle}
          pinnedNotes={pinnedNotes}
          addNewPinnedNote={handlePinToggle}
          localSearchResults={localSearchResults}
          highlightedIndex={highlightedIndex}
          categoryOrder={categoryOrder}
          labels={labels}
          handleNoteDelete={handleNoteDelete}
          openSwipeItemSlug={openSwipeItemSlug}
          setOpenSwipeItemSlug={setOpenSwipeItemSlug}
          highlightedNote={highlightedNote}
          searchQuery={searchQuery}
          clearSearch={clearSearch}
        />
      </div>
    </div>
  );
}
