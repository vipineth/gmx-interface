import { createContext, FC, PropsWithChildren, useContext, useEffect, useState } from "react";
import { ApolloClient, InMemoryCache } from "@apollo/client";
import { queryAccountOpenPositions } from "../../graphql";

export type LeaderboardContextType = {
  leaderPositions: Array<any>;
};

export const LeaderboardContext = createContext<LeaderboardContextType>({
  leaderPositions: [],
});

export const useLeaderboardContext = () => useContext(LeaderboardContext);

const DATA_ENDPOINT = "https://api.thegraph.com/subgraphs/name/ullin-oi/leaderboards"; // TODO: replace with prod url

export const LeaderboardContextProvider: FC<PropsWithChildren> = ({ children }) => {
  const [leaderPositions, setLeaderPositions] = useState<Array<any>>([]);

  useEffect(() => {
    void (async () => {
      const client = new ApolloClient({
        uri: DATA_ENDPOINT,
        cache: new InMemoryCache(),
      });

      const res = await client.query({ query: queryAccountOpenPositions });

      setLeaderPositions(res.data as Array<any>);
    })();
  }, []);

  const context: LeaderboardContextType = {
    leaderPositions,
  };

  return <LeaderboardContext.Provider value={context}>{children}</LeaderboardContext.Provider>;
};
