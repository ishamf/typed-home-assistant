import { connect, StateType } from "./lib.ts";
import { writeFile } from "node:fs/promises";

import {
  generate as babelGenerate,
  HassEntities,
  HassServices,
  subscribeEntities,
  subscribeServices,
  t,
  template,
} from "./deps.ts";

const outTemplate = template.program(
  `
import { createRuntime, StateType } from "./lib.ts";

%%entities%%

export default createRuntime(entities);
`,
  { plugins: ["typescript"] },
);

function guessStateType(state: string) {
  if (!isNaN(parseFloat(state))) {
    return StateType.Number;
  }

  return StateType.String;
}

const entityTemplate = template.expression(
  `{
    stateType: %%stateType%%,
    attributes: %%attributes%%
  }`,
);

const attributeTemplate = template.expression(
  `{
    attrType: %%attrType%%
  }`,
);

const stateTypeAst = {
  [StateType.Number]: template.expression.ast(`StateType.Number`),
  [StateType.String]: template.expression.ast(`StateType.String`),
};

export async function generate(output: string) {
  const conn = await connect();
  // Get events and services

  const [entities, services] = await Promise.all([
    new Promise<HassEntities>((resolve) => {
      const remove = subscribeEntities(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
    new Promise<HassServices>((resolve) => {
      const remove = subscribeServices(conn, (state) => {
        resolve(state);
        remove();
      });
    }),
  ]);

  conn.close();

  const entitiesAst = t.variableDeclaration(
    "const",
    [t.variableDeclarator(
      t.identifier("entities"),
      t.tsAsExpression(
        t.objectExpression(
          Object.keys(entities).map((entityId) => {
            const entity = entities[entityId];
            return t.objectProperty(
              t.stringLiteral(entityId),
              entityTemplate({
                stateType: stateTypeAst[guessStateType(entity.state)],
                attributes: t.objectExpression(
                  Object.keys(entity.attributes).map((attributeId) => {
                    const attribute = entity.attributes[attributeId];
                    return t.objectProperty(
                      t.stringLiteral(attributeId),
                      attributeTemplate({
                        attrType: stateTypeAst[guessStateType(attribute)],
                      }),
                    );
                  }),
                ),
              }),
            );
          }),
        ),
        t.tsTypeReference(t.identifier("const")),
      ),
    )],
  );

  const out = outTemplate({
    entities: entitiesAst,
  });

  await writeFile(output, (babelGenerate(out)).code);
}

if (import.meta.main) {
  generate("autogen.ts");
}
