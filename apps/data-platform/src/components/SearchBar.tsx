import { Button, InputGroup, Switch } from "@blueprintjs/core";

type Props = {
  query: string;
  onQueryChange: (query: string) => void;
  searchAll: boolean;
  onSearchAllChange: (searchAll: boolean) => void;
  placeholder: string;
};

export default function SearchBar({ query, onQueryChange, searchAll, onSearchAllChange, placeholder }: Props) {
  return (
    <div className="om-search" role="search">
      <InputGroup
        className="om-search__input"
        leftIcon="search"
        placeholder={placeholder}
        aria-label={placeholder}
        value={query}
        onChange={(event) => onQueryChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") onQueryChange("");
        }}
        {...(query !== ""
          ? { rightElement: <Button minimal icon="cross" aria-label="Clear search" onClick={() => onQueryChange("")} /> }
          : {})}
      />
      <Switch
        className="om-search__toggle"
        label="Search all types"
        checked={searchAll}
        onChange={(event) => onSearchAllChange(event.currentTarget.checked)}
      />
    </div>
  );
}
