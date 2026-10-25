import { Button, Callout, H2, NonIdealState, Section, SectionCard, Spinner } from "@blueprintjs/core";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  getInstance,
  getObjectType,
  listInstances,
  type InstanceDetail,
  type InstanceListing,
  type InstanceRow,
  type ObjectTypeListing,
  type TypeBundle,
} from "../api.ts";
import CountTitle from "../components/CountTitle.tsx";
import InstanceTable from "../components/InstanceTable.tsx";
import ObjectDetail from "../components/ObjectDetail.tsx";
import SearchBar from "../components/SearchBar.tsx";
import TypeRail from "../components/TypeRail.tsx";
import { normalizeQuery, searchRows, type Match } from "../search.ts";

/** Where the explorer is looking. The stack of these is what back walks. */
type Location = { kind: "list"; type: string } | { kind: "object"; type: string; id: string };

const message = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString()} ${count === 1 ? one : many}`;

/** Lets the table say which properties put each row in the results. */
function matchedInFor(matches: Match[]): (row: InstanceRow) => string[] {
  const byRow = new Map(matches.map((match) => [match.row, match.matched.map((property) => property.name)]));
  return (row) => byRow.get(row) ?? [];
}

export default function ObjectExplorer({ types }: { types: ObjectTypeListing[] }) {
  const [stack, setStack] = useState<Location[]>([]);
  const [bundles, setBundles] = useState<Record<string, TypeBundle>>({});
  const [listing, setListing] = useState<InstanceListing | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [searchAll, setSearchAll] = useState(false);
  const [allListings, setAllListings] = useState<Record<string, InstanceListing> | null>(null);

  const bundlesRef = useRef<Record<string, TypeBundle>>({});
  const inFlight = useRef<Set<string>>(new Set());

  const location = stack.at(-1) ?? null;
  const bundle = location ? bundles[location.type] : undefined;

  // Typing stays responsive; the filtering catches up a beat behind.
  const deferredQuery = useDeferredValue(query);
  const searching = normalizeQuery(deferredQuery) !== "";

  /** Loads a type's metadata once; linked types need it to be read by title. */
  const ensureBundle = useCallback((apiName: string) => {
    if (bundlesRef.current[apiName] || inFlight.current.has(apiName)) return;
    inFlight.current.add(apiName);
    getObjectType(apiName)
      .then((loaded) => {
        bundlesRef.current = { ...bundlesRef.current, [apiName]: loaded };
        setBundles(bundlesRef.current);
      })
      .catch((cause: unknown) => setError(message(cause)))
      .finally(() => inFlight.current.delete(apiName));
  }, []);

  // Land on the first type until something is picked.
  useEffect(() => {
    if (stack.length === 0 && types.length > 0) {
      const first = types[0];
      if (first) setStack([{ kind: "list", type: first.api_name }]);
    }
  }, [stack.length, types]);

  useEffect(() => {
    if (!location) return;
    ensureBundle(location.type);

    let cancelled = false;
    setError(null);

    if (location.kind === "list") {
      setDetail(null);
      setListing(null);
      listInstances(location.type)
        .then((next) => !cancelled && setListing(next))
        .catch((cause: unknown) => !cancelled && setError(message(cause)));
    } else {
      setListing(null);
      setDetail(null);
      getInstance(location.type, location.id)
        .then((next) => {
          if (cancelled) return;
          setDetail(next);
          // Linked rows are read by their own type's title property.
          for (const link of Object.values(next.links)) ensureBundle(link.objectType);
        })
        .catch((cause: unknown) => !cancelled && setError(message(cause)));
    }

    return () => {
      cancelled = true;
    };
  }, [location, ensureBundle]);

  // Searching every type needs every type's rows and metadata. They are re-read
  // each time the list comes back into view, so an action run in the meantime shows.
  useEffect(() => {
    if (!searchAll || location?.kind !== "list") return;
    let cancelled = false;

    for (const type of types) ensureBundle(type.api_name);
    Promise.all(types.map((type) => listInstances(type.api_name)))
      .then((results) => {
        if (!cancelled) setAllListings(Object.fromEntries(results.map((result) => [result.type, result])));
      })
      .catch((cause: unknown) => !cancelled && setError(message(cause)));

    return () => {
      cancelled = true;
    };
  }, [searchAll, location, types, ensureBundle]);

  const typeMatches = useMemo(
    // The listing is checked against the location: for one render after a type
    // switch it still holds the previous type's rows.
    () =>
      listing && bundle && location && listing.type === location.type
        ? searchRows(listing.data, bundle.properties, deferredQuery)
        : null,
    [listing, bundle, location, deferredQuery],
  );

  const groups = useMemo(() => {
    if (!searchAll || !allListings) return null;
    return types.flatMap((type) => {
      const typeBundle = bundles[type.api_name];
      const typeListing = allListings[type.api_name];
      if (!typeBundle || !typeListing) return [];
      const matches = searchRows(typeListing.data, typeBundle.properties, deferredQuery);
      return matches.length > 0 ? [{ bundle: typeBundle, matches }] : [];
    });
  }, [searchAll, allListings, bundles, types, deferredQuery]);

  const allReady = allListings !== null && types.every((type) => bundles[type.api_name] !== undefined);

  /** Re-fetches the open object without blanking the view, so a dialog can stay on top. */
  const refreshDetail = useCallback(async () => {
    if (location?.kind !== "object") return;
    const next = await getInstance(location.type, location.id);
    setDetail(next);
    for (const link of Object.values(next.links)) ensureBundle(link.objectType);
  }, [location, ensureBundle]);

  // Picking a type in the rail means looking at that type, so it leaves all-types search.
  const selectType = (apiName: string) => {
    setSearchAll(false);
    setStack([{ kind: "list", type: apiName }]);
  };
  const push = (next: Location) => setStack((current) => [...current, next]);
  const back = () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current));

  const displayName = (apiName: string) =>
    bundles[apiName]?.objectType.name ?? types.find((type) => type.api_name === apiName)?.name ?? apiName;

  const trail = stack
    .map((entry) =>
      entry.kind === "object" ? entry.id : searchAll ? "All object types" : displayName(entry.type),
    )
    .join("  ›  ");

  const searchBar = (placeholder: string) => (
    <SearchBar
      query={query}
      onQueryChange={setQuery}
      searchAll={searchAll}
      onSearchAllChange={setSearchAll}
      placeholder={placeholder}
    />
  );

  function renderContent(): ReactNode {
    if (!location || !bundle) return <Spinner className="om-spinner" />;

    if (location.kind === "object") {
      return detail ? (
        <ObjectDetail
          bundle={bundle}
          detail={detail}
          bundles={bundles}
          onOpenLink={(type, id) => push({ kind: "object", type, id })}
          onRefresh={refreshDetail}
        />
      ) : (
        <Spinner className="om-spinner" />
      );
    }

    if (searchAll) {
      const total = groups?.reduce((sum, group) => sum + group.matches.length, 0) ?? 0;
      return (
        <div className="om-detail">
          <header className="om-header">
            <div className="om-header__text">
              <H2 className="om-header__title">All object types</H2>
              <div className="om-muted">
                {searching && allReady && groups
                  ? `${plural(total, "match", "matches")} in ${plural(groups.length, "type", "types")}`
                  : plural(types.length, "object type", "object types")}
              </div>
            </div>
          </header>

          {searchBar(`Search all ${types.length} object types`)}

          {!searching ? (
            <NonIdealState
              className="om-empty"
              icon="search"
              title="Search every object type"
              description="Matches any property value except booleans, grouped by type."
            />
          ) : !allReady || !groups ? (
            <Spinner className="om-spinner" />
          ) : groups.length === 0 ? (
            <NonIdealState
              className="om-empty"
              icon="search"
              title="No matches"
              description={`No object of any type contains “${deferredQuery.trim()}”.`}
            />
          ) : (
            groups.map((group) => (
              <Section
                key={group.bundle.objectType.api_name}
                className="om-group"
                compact
                title={<CountTitle title={group.bundle.objectType.name} count={group.matches.length} />}
              >
                <SectionCard padded={false}>
                  <InstanceTable
                    bundle={group.bundle}
                    rows={group.matches.map((match) => match.row)}
                    matchedIn={matchedInFor(group.matches)}
                    onOpen={(id) => push({ kind: "object", type: group.bundle.objectType.api_name, id })}
                  />
                </SectionCard>
              </Section>
            ))
          )}
        </div>
      );
    }

    if (!listing || !typeMatches) return <Spinner className="om-spinner" />;

    return (
      <div className="om-detail">
        <header className="om-header">
          <div className="om-header__text">
            <H2 className="om-header__title">{bundle.objectType.name}</H2>
            <div className="om-muted">
              {searching
                ? `${typeMatches.length.toLocaleString()} of ${plural(listing.count, "object", "objects")}`
                : plural(listing.count, "object", "objects")}
            </div>
          </div>
        </header>

        {searchBar(`Search ${bundle.objectType.name}`)}

        {searching && typeMatches.length === 0 ? (
          <NonIdealState
            className="om-empty"
            icon="search"
            title="No matches"
            description={`No ${bundle.objectType.name} contains “${deferredQuery.trim()}”.`}
          />
        ) : (
          <InstanceTable
            bundle={bundle}
            rows={typeMatches.map((match) => match.row)}
            onOpen={(id) => push({ kind: "object", type: location.type, id })}
            {...(searching ? { matchedIn: matchedInFor(typeMatches) } : {})}
          />
        )}
      </div>
    );
  }

  return (
    <div className="om-layout">
      <TypeRail types={types} selected={searchAll ? null : (location?.type ?? null)} onSelect={selectType} />
      <main className="om-main">
        <div className="om-crumbs">
          <Button minimal small icon="chevron-left" text="Back" disabled={stack.length <= 1} onClick={back} />
          <span className="om-muted om-crumbs__trail">{trail}</span>
        </div>

        {error && (
          <Callout intent="danger" title="Could not load" className="om-alert">
            {error}
          </Callout>
        )}

        {renderContent()}
      </main>
    </div>
  );
}
