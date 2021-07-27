// api
import { thothSearchForPackage, getLicenses } from "services/thothApi";

// utils
import { Graph } from "utils/Graph";

// redux
import { DispatchContext, StateContext } from "App";

import { useContext, useEffect, useState } from "react";

//vis-dataset
import { DataSet } from "vis-network/standalone/esm/vis-network";

import { useTheme } from "@material-ui/core/styles";

// React hook for computing metrics and applying to state
export function useComputeMetrics(graph, roots) {
  const dispatch = useContext(DispatchContext);
  const state = useContext(StateContext);

  useEffect(() => {
    if (!state?.advise?.metadata || !state?.mergedGraph) {
      return;
    }

    const advise = {
      added: 0,
      removed: 0,
      version: 0,
      equal: 0,
      justification: {},
      build: null
    };

    // package changes
    state.mergedGraph.forEach(node => {
      switch (node.change) {
        case "added":
          advise.added++;
          break;
        case "removed":
          advise.removed++;
          break;
        case "version":
          advise.version++;
          break;
        default:
          advise.equal++;
      }
    });

    // build environment
    advise.build = `We have analysed an application stack running on ${state.advise.metadata.os_release.name} ${state.advise.metadata.os_release.version}, running Python (${state.advise.metadata.python.implementation_name}) ${state.advise.metadata.python.major}.${state.advise.metadata.python.minor}.${state.advise.metadata.python.micro}. It was Adviser Job ID ${state.advise.metadata.document_id}, by ${state.advise.metadata.analyzer} v${state.advise.metadata.analyzer_version}. `;

    // justification counts
    state.advise?.report?.products?.[0]?.justification.forEach(
      justification => {
        if (justification.type !== "INFO") {
          if (advise?.justification[justification.type] !== undefined) {
            advise.justification[justification.type]++;
          } else {
            advise.justification[justification.type] = 0;
          }
        }
      }
    );

    dispatch({
      type: "metric",
      metric: "advise",
      payload: advise
    });
  }, [state.mergedGraph, state.advise, dispatch]);

  // get license info
  const [licenseData, setLicenseData] = useState();
  useEffect(() => {
    getLicenses()
      .then(licenseData => {
        setLicenseData(licenseData);
      })
      .catch(() => setLicenseData({}));
  }, []);

  useEffect(() => {
    if (!graph || !roots || !licenseData) {
      return;
    }

    let dependencies = {
      all: {},
      roots: {}
    };

    let licenses = { total: undefined, all: {} };

    // for each starting node
    Object.keys(roots).forEach(root => {
      const bfs = graph.graphSearch(graph.nodes.get(root));
      const visitedOrder = Array.from(bfs);

      // depth to type of dependency
      visitedOrder.forEach(node => {
        const depth =
          node.value.depth === 0 || roots[node.value.id]
            ? "roots"
            : node.value.depth === 1
            ? "direct"
            : "indirect";

        // dependency metric
        dependencies = {
          all: {
            ...dependencies.all,
            [depth]: (dependencies.all[depth] ?? 0) + 1
          },
          roots: {
            ...dependencies.roots,
            [root]: {
              ...(dependencies.roots[root] ?? null),
              [depth]: (dependencies.roots?.[root]?.[depth] ?? 0) + 1
            }
          }
        };

        // licence metric

        // find license in dataset
        let found = undefined;
        if (licenseData.licenses) {
          found = licenseData.licenses.find(l => {
            const lower = node.value.metadata.license.toLowerCase();
            return (
              l.name.toLowerCase() === lower ||
              l.licenseId.toLowerCase() === lower
            );
          });
        }

        licenses = {
          total: (licenses.total ?? 0) + 1,
          root: licenses.root ?? node.value.metadata.license,
          all: {
            ...licenses.all,
            [found?.licenseId ?? node.value.metadata.license]: {
              ...(licenses.all[node.value.metadata.license] ?? null),
              [node.value.label]: node.value.depth,
              _found: found !== undefined,
              _isOsiApproved: found?.isOsiApproved ?? null,
              _isFsfLibre: found?.isFsfLibre ?? null
            }
          }
        };
      });
    });

    // apply metrics to global state
    dispatch({
      type: "metric",
      metric: "dependencies",
      payload: dependencies
    });
    dispatch({
      type: "metric",
      metric: "licenses",
      payload: licenses
    });
  }, [graph, dispatch, roots, licenseData]);
}

export function useMergeGraphs(
  oldGraph,
  newGraph,
  root,
  showOldPackages = false
) {
  const dispatch = useContext(DispatchContext);
  const state = useContext(StateContext);

  const theme = useTheme();

  const [visGraph, setVisGraph] = useState(undefined);
  const [filterdGraph, setFilterdGraph] = useState(undefined);

  useEffect(() => {
    if (!oldGraph || !newGraph || !root) {
      return;
    }

    const data = {
      nodes: [],
      edges: []
    };

    const edgeColors = new Map();

    oldGraph.nodes.forEach((value, key) => {
      // if the new and old graph have the same package
      if (newGraph.nodes.has(key)) {
        // if the versions match
        const newNode = newGraph.nodes.get(key);

        if (
          key === root ||
          value.value.metadata.version === newNode.value.metadata.version
        ) {
          data.nodes.push({
            id: newNode.value.id,
            label:
              newNode.value.label +
              " " +
              (newNode?.value?.metadata?.version ?? ""),
            node: newNode,
            change: "equal"
          });
        }
        // if the versions are different
        else {
          // set package node
          data.nodes.push({
            id: newNode.value.id,
            label: newNode.value.label + " " + newNode.value.metadata.version,
            font: {
              color: theme.palette.success.main
            },
            node: newNode,
            change: "version"
          });
        }
      }
      // if new graph does not have package then it is removed
      else {
        data.nodes.push({
          id: value.value.id,
          label: value.value.label + " " + value.value.metadata.version,
          font: {
            color: theme.palette.error.main
          },
          color: theme.palette.error.main,
          node: oldGraph.nodes.get(value.value.id),
          change: "removed"
        });

        edgeColors.set(value.value.id, theme.palette.error.main);
      }
    });

    // get added nodes
    newGraph.nodes.forEach((value, key) => {
      // if the old grpah does not have what new graph has
      if (!oldGraph.nodes.has(key)) {
        data.nodes.push({
          id: value.value.id,
          label: value.value.label + " " + value.value.metadata.version,
          font: {
            color: theme.palette.success.main
          },
          color: theme.palette.success.main,
          node: newGraph.nodes.get(value.value.id),
          change: "added"
        });

        edgeColors.set(value.value.id, theme.palette.success.main);
      }
    });

    oldGraph.nodes.forEach((value, key) => {
      // set package edges
      value.adjacents.forEach(adj => {
        data.edges.push({
          to: value.value.id,
          from: adj.value.id,
          color: edgeColors.get(adj.value.id) ?? undefined
        });
      });
    });

    newGraph.nodes.forEach((value, key) => {
      // set package edges
      value.adjacents.forEach(adj => {
        data.edges.push({
          to: value.value.id,
          from: adj.value.id,
          color: edgeColors.get(adj.value.id) ?? undefined
        });
      });
    });

    const visData = {
      nodes: new DataSet(data.nodes),
      edges: new DataSet(data.edges)
    };

    setVisGraph(visData);

    dispatch({
      type: "graph",
      name: "mergedGraph",
      payload: data.nodes
    });
  }, [oldGraph, newGraph, theme, root, dispatch]);

  // if filter type is changed then apply filter to state
  useEffect(() => {
    if (!state.mergedGraph || !visGraph?.edges) {
      return;
    }

    const filterdNodes = state.mergedGraph.filter(node => {
      return node.change !== "removed" || showOldPackages;
    });

    setFilterdGraph(filterdNodes);

    setVisGraph({
      nodes: new DataSet(filterdNodes),
      edges: visGraph.edges
    });
  }, [showOldPackages, dispatch, state.mergedGraph, visGraph?.edges]);

  return { visGraph: visGraph, filterdGraph: filterdGraph };
}

export function useLockFileToGraph(pipfile, pipfileLock, stateName) {
  const dispatch = useContext(DispatchContext);

  useEffect(() => {
    if (!pipfile || !pipfileLock || !stateName) {
      return;
    }

    const graph = new Graph();

    (async () => {
      const cantBeRoots = [];

      await Promise.all(
        // create nodes
        Object.entries(pipfileLock).map(async ([key, value]) => {
          // if package in pipfile has a match in the pipfile.lock
          if (localStorage.getItem(key + value.version.replace("==", ""))) {
            const metadata = JSON.parse(
              localStorage.getItem(key + value.version.replace("==", ""))
            );
            const v = {
              id: metadata.name.toLowerCase().replace(".", "-"),
              label: metadata.name,
              depth: null,
              metadata: metadata
            };

            // add root to graph
            graph.addVertex(v.id, v);

            // add to cantBeRoots list

            metadata.requires_dist?.forEach(adj => {
              const adjacentName = adj
                .split(" ", 1)[0]
                .toLowerCase()
                .replace(".", "-");
              const adjacentData = pipfileLock[adjacentName];

              // if package exists in lockfile
              if (adjacentData) {
                cantBeRoots.push(adjacentName);
              }
            });
          } else {
            return await thothSearchForPackage(
              key,
              value.version.replace("==", "")
            ).then(metadata => {
              const v = {
                id: metadata.name.toLowerCase().replace(".", "-"),
                label: metadata.name,
                depth: null,
                metadata: metadata
              };

              localStorage.setItem(
                key + value.version.replace("==", ""),
                JSON.stringify(metadata)
              );

              // add root to graph
              graph.addVertex(v.id, v);

              // add to cantBeRoots list
              metadata.requires_dist?.forEach(adj => {
                const adjacentName = adj
                  .split(" ", 1)[0]
                  .toLowerCase()
                  .replace(".", "-");
                const adjacentData = pipfileLock[adjacentName];

                // if package exists in lockfile
                if (adjacentData) {
                  cantBeRoots.push(adjacentName);
                }
              });
            });
          }
        })
      ).catch(e => {
        dispatch({
          type: "error",
          payload:
            (e?.response?.statusText ?? "Unknown Error") +
            ": an error occured while fetching package data."
        });
      });

      // add app to graph
      const app = graph.addVertex("*App", {
        id: "*App",
        label: "App",
        depth: -1
      });
      cantBeRoots.push("*App");

      // get roots
      const visited = new Map();
      const visitList = [];
      graph.nodes.forEach((value, key, map) => {
        if (!cantBeRoots.includes(key) || Object.keys(pipfile).includes(key)) {
          const node = map.get(key);
          node.value.depth = 0;
          visitList.push(node);

          graph.addEdge(app.key, node.key);
        }
      });

      // run dfs to connect nodes

      const promiseWhile = (data, condition, action) => {
        var whilst = data => {
          return condition(data)
            ? action().then(whilst)
            : Promise.resolve(data);
        };
        return whilst(data);
      };

      await promiseWhile(
        visitList,
        i => i.length > 0,
        () => {
          const node = visitList.pop();
          if (node && !visited.has(node)) {
            visited.set(node);

            // get dependencies
            if (node?.value?.metadata?.requires_dist) {
              // for each dependency, parse to get name
              node.value.metadata.requires_dist.map(async adj => {
                const adjacentNode = graph.nodes.get(
                  adj
                    .split(" ", 1)[0]
                    .toLowerCase()
                    .replace(".", "-")
                );

                // if package exists in lockfile
                if (adjacentNode) {
                  // update depth
                  adjacentNode.value.depth = node.value.depth + 1;

                  // add edge connecting parent and dependency
                  graph.addEdge(node.key, adjacentNode.value.id);
                  await visitList.push(adjacentNode);
                }
              });
            }
          }
          return new Promise((resolve, reject) => {
            resolve(visitList);
          });
        }
      );
    })().then(() => {
      dispatch({
        type: "graph",
        name: stateName,
        payload: graph
      });
    });
  }, [pipfile, pipfileLock, dispatch, stateName]);
}
