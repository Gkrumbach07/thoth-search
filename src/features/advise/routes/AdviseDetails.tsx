import React, { useContext, useState } from "react";
import { Grid, Box, Typography } from "@mui/material";
import { SelectedPackage } from "../components";
import { Graph } from "lib/interfaces/Graph";
import { Node } from "lib/interfaces/Node";
import { PackageNodeValue } from "lib/interfaces/PackageNodeValue";
import { PackageList } from "../components/PackageList";
import Loading from "components/Elements/Loading/Loading";
import { StateContext } from "stores/Global";

type SelectedPackageType = {
    selected: string;
    setSelected: (c: string) => void;
};

export const SelectedPackageContext = React.createContext<SelectedPackageType>(
    {} as SelectedPackageType,
);

interface IAdviseDetails {
    graph?: Graph<Node<PackageNodeValue>>;
}

export const AdviseDetails = ({ graph }: IAdviseDetails) => {
    const [selected, setSelected] = useState<string>("");
    const state = useContext(StateContext);

    if (!graph) {
        return (
            <Loading
                type="circular"
                label={state?.loading?.["graph"].text}
                progress={
                    ((state?.loading?.["graph"].value ?? 0) /
                        (state?.loading?.["graph"].total ?? 1)) *
                    100
                }
            />
        );
    }

    if (graph.nodes.size === 1) {
        return (
            <Box
                height="100vh"
                flexDirection="column"
                display="flex"
                justifyContent="center"
                alignItems="center"
            >
                <Typography variant="h5" align="center">
                    No packages found
                </Typography>
                <Typography variant="body2" align="center">
                    The advise document encountered an error resulting in no
                    Pipfile.lock
                </Typography>
            </Box>
        );
    }

    return (
        <SelectedPackageContext.Provider value={{ selected, setSelected }}>
            <Grid
                container
                spacing={0}
                justifyContent="center"
                alignItems="flex-start"
            >
                <Grid item sm={12} md={4} sx={{ padding: 1 }}>
                    <PackageList graph={graph} />
                </Grid>
                <Grid item sm={12} md={8} sx={{ padding: 1 }}>
                    {!selected || !graph ? (
                        <Box
                            height="100vh"
                            flexDirection="column"
                            display="flex"
                            justifyContent="center"
                            alignItems="center"
                        >
                            <Typography variant="h5" align="center">
                                Choose a package
                            </Typography>
                            <Typography variant="body2" align="center">
                                Click on a package from the packages found in
                                the Pipfile.lock
                            </Typography>
                        </Box>
                    ) : (
                        <SelectedPackage graph={graph} />
                    )}
                </Grid>
            </Grid>
        </SelectedPackageContext.Provider>
    );
};