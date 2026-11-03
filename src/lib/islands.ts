import type { Topic, Word } from "../types";
import type { Library } from "./data";

/**
 * Each island's cover: one word's picture that says what the island is about, chosen by hand from a
 * contact sheet so every island shows the same picture-book style. Core islands of small words that
 * cannot be drawn (I, the, when, can) borrow a picture from another island that carries their idea.
 */
export const ISLAND_COVER: Record<string, string> = {
  colours: "paint", family: "family", food: "apple", clothes: "t-shirt", home: "house", school: "classroom",
  nature: "tree", weather: "umbrella", time: "clock", sport: "football", hobbies: "guitar", health: "body",
  town: "town", buildings: "building", countryside: "farm", shopping: "supermarket", services: "hospital",
  travel: "plane", jobs: "police-officer", media: "cinema", tech: "computer", appliances: "fridge",
  documents: "letter", measure: "ruler", feelings: "happy", animals: "lion", numbers: "ten", world: "map",
  "core-me": "child", "core-anyone": "people", "core-little": "book", "core-where": "under", "core-when": "watch",
  "core-howmuch": "money", "core-hello": "friend", "core-move": "run", "core-give": "present", "core-think": "ask",
  "core-can": "swim", "core-do": "cook", "core-feel": "exciting", "core-describe": "big", "core-people": "adult",
  "core-things": "balloon", "core-fun": "circus", "core-places": "city", "core-words": "internet", "core-nature": "eagle",
};

const ISLAND_EMOJI: Record<string, string> = {
  animals: "🦁", colours: "🎨", family: "👨‍👩‍👧", food: "🍎", clothes: "👕", home: "🏠", school: "🏫",
  nature: "🌳", weather: "🌦️", time: "⏰", sport: "⚽", hobbies: "🎸", health: "💪", town: "🏙️",
  buildings: "🏛️", countryside: "🌾", shopping: "🛒", services: "🏥", travel: "✈️", jobs: "👩‍🚒",
  media: "🎬", tech: "💻", appliances: "📺", documents: "✉️", measure: "📏", feelings: "😊",
  numbers: "🔢", world: "🌍",
};

export const islandEmoji = (t: Topic) => t.emoji ?? ISLAND_EMOJI[t.id] ?? "🏝️";

/** The cover word of an island, or its first illustrated word for an island added without one. */
export function islandCover(library: Library, t: Topic): Word | undefined {
  const chosen = library.byId.get(ISLAND_COVER[t.id] ?? "");
  if (chosen?.media.img) return chosen;
  return (library.topics[t.id] ?? []).find((w) => w.media.img);
}
