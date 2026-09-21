import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { RelationshipBadge, RelationshipOptions, firstAvailableRelationship, relationshipLabel, takenRelationships } from "./relationships";

describe("relationship labels and the one-Mother / one-Father rule", () => {
  it("has a clear label for every relationship, with an icon-badge", () => {
    expect(relationshipLabel("MOTHER")).toBe("Mother");
    expect(relationshipLabel("FATHER")).toBe("Father");
    expect(relationshipLabel("GUARDIAN")).toBe("Guardian");
    expect(relationshipLabel("OTHER")).toBe("Other relative");

    render(<RelationshipBadge relationship="MOTHER" />);
    expect(screen.getByText("Mother")).toBeInTheDocument();
  });

  it("only Mother and Father are single-holder; other relationships never appear as taken", () => {
    const taken = takenRelationships([
      { firstName: "Amina", lastName: "Ali", relationship: "MOTHER" },
      { firstName: "Ahmed", lastName: "Ali", relationship: "OTHER" },
      { firstName: "Hodan", lastName: "Ali", relationship: "GUARDIAN" },
    ]);

    expect(taken).toEqual({ MOTHER: "Amina Ali" });
  });

  it("defaults to the first relationship that is still available", () => {
    expect(firstAvailableRelationship({})).toBe("FATHER");
    expect(firstAvailableRelationship({ FATHER: "A B" })).toBe("MOTHER");
    expect(firstAvailableRelationship({ FATHER: "A B", MOTHER: "C D" })).toBe("GUARDIAN");
  });

  it("a taken Mother/Father option stays visible but disabled and names who holds it", () => {
    render(
      <select aria-label="Relationship">
        <RelationshipOptions taken={{ MOTHER: "Amina Ali" }} />
      </select>,
    );

    expect(screen.getByRole("option", { name: "Mother — already assigned to Amina Ali" })).toBeDisabled();
    expect(screen.getByRole("option", { name: "Father" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Guardian" })).toBeEnabled();
    expect(screen.getByRole("option", { name: "Other relative" })).toBeEnabled();
  });
});
