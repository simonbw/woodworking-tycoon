import React, {
  ReactNode,
  createContext,
  useContext,
  useEffect,
  useId,
  useReducer,
  useRef,
} from "react";

const consumerCountContext = createContext<
  { useConsumerIndex: () => number } | undefined
>(undefined);

export const ActionKeyContextProvider: React.FC<{ children?: ReactNode }> = ({
  children,
}) => {
  const idListRef = useRef<string[]>([]);
  const rerender = useReducer((x) => x + 1, 0)[1];

  function useConsumerIndex(): number {
    const id = useId();

    if (!idListRef.current.includes(id)) {
      idListRef.current.push(id);
    }

    useEffect(() => {
      if (!idListRef.current.includes(id)) {
        idListRef.current.push(id);
        rerender();
      }

      return () => {
        if (idListRef.current.includes(id)) {
          idListRef.current.splice(idListRef.current.indexOf(id));
        }
        rerender();
      };
    }, []);

    return idListRef.current.indexOf(id);
  }

  return (
    <consumerCountContext.Provider value={{ useConsumerIndex }}>
      {children}
    </consumerCountContext.Provider>
  );
};

const actionKeyCodes = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export function useActionKeys(): string | undefined {
  const context = useContext(consumerCountContext);
  if (context === undefined) {
    throw new Error(
      "useActionKeys must be used within a ActionKeyContextProvider",
    );
  }
  const index = context.useConsumerIndex();
  return actionKeyCodes[index];
}
