import { writeFile } from "node:fs/promises";

import {
  type HassEntities,
  type HassServices,
  subscribeEntities,
  subscribeServices,
} from "../deps.ts";

import { generate as babelGenerate, t, template } from "./deps.ts";

import { connect, StateType } from "../lib.ts";
import { PACKAGE_VERSION } from "../constants.ts";

const importSpec = "Deno" in globalThis
  ? `jsr:@isham/typed-home-assistant@^${PACKAGE_VERSION}`
  : "@isham/typed-home-assistant";

const outTemplate = template.program(
  `
import { createRuntime, StateType } from "${importSpec}";

%%entities%%

%%services%%

export default createRuntime(entities, services);
`,
  { plugins: ["typescript"] },
);

function guessStateType(state: string) {
  if (!isNaN(parseFloat(state))) {
    return StateType.Number;
  }

  return StateType.String;
}

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

  const servicesAst = t.variableDeclaration(
    "const",
    [t.variableDeclarator(
      t.identifier("services"),
      t.tsAsExpression(
        t.objectExpression(
          Object.keys(services).flatMap((domainId) => {
            const domain = services[domainId];
            return Object.keys(domain).map((serviceId) => {
              const service = domain[serviceId];

              return t.objectProperty(
                t.stringLiteral(`${domainId}.${serviceId}`),
                t.objectExpression([
                  t.objectProperty(
                    t.identifier("fields"),
                    t.tsAsExpression(
                      t.objectExpression(
                        [],
                      ),
                      t.tsTypeLiteral(
                        Object.keys(service.fields).map((fieldId) => {
                          const field = service.fields[fieldId];

                          const propertySignature = {
                            ...t.tsPropertySignature(
                              t.stringLiteral(fieldId),
                              t.tsTypeAnnotation(
                                "number" in (field.selector || {})
                                  ? t.tsNumberKeyword()
                                  : t.tsStringKeyword(),
                              ),
                            ),
                            optional: !field.required,
                          };

                          if (field.description) {
                            return t.addComment(
                              propertySignature,
                              "leading",
                              field.description.split("\n").map((x) => "* " + x)
                                .join("\n"),
                            );
                          }

                          return propertySignature;
                        }),
                      ),
                    ),
                  ),
                ]),
              );
            });
          }),
        ),
        t.tsTypeReference(t.identifier("const")),
      ),
    )],
  );

  const out = outTemplate({
    entities: entitiesAst,
    services: servicesAst,
  });

  await writeFile(output, (babelGenerate(out)).code);
}
