import { describe, expect, it } from "vitest";
import { ROUTE, routeOrder, unitOf } from "./route";
import type { Topic } from "../types";

const topic = (id: string, ready = true) => ({ id, en: id, zh: id, count: 1, ready }) as Topic;

describe("Think course route", () => {
  it("lists each island once, Starter first", () => {
    const ids = ROUTE.flatMap((s) => s.islands);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe("colours");
    expect(unitOf("family")).toMatchObject({ book: "Think Starter", unit: "3" });
  });

  it("orders open islands by the route and keeps any the route leaves out at the end", () => {
    const order = routeOrder([topic("animals"), topic("family"), topic("colours"), topic("secret"), topic("jobs", false)]);
    expect(order).toEqual(["colours", "family", "animals", "secret"]);
  });
});
