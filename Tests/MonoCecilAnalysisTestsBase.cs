using System;
using System.Linq;
using System.Collections.Generic;

using Mono.Cecil;
using Mono.Cecil.Cil;

using CKAN.Extensions;

namespace Tests
{
    using MethodCall = List<MethodDefinition>;
    using CallsDict  = Dictionary<MethodDefinition, List<MethodDefinition>>;

    public abstract class MonoCecilAnalysisBase
    {
        protected static string FullyQualifiedName(MethodReference md)
            => $"{FullyQualifiedName(md.DeclaringType)}.{md.Name}";

        protected static string FullyQualifiedName(TypeReference td)
            => string.Join(".", td.TraverseNodes(td => td.DeclaringType)
                                  .Reverse()
                                  .Select(td => td.DeclaringType == null
                                                && td.Namespace != null
                                                    ? $"{td.Namespace}.{td.Name}"
                                                    : td.Name));

        protected static string SimpleName(MethodDefinition md)
            => $"{md.DeclaringType.Name}.{md.Name}";

        // https://gist.github.com/lnicola/b48db1a6ff3617bdac2a
        protected static IEnumerable<MethodCall> VisitMethodDefinition(MethodCall                   fullStack,
                                                                       MethodDefinition             methDef,
                                                                       CallsDict                    calls,
                                                                       Func<MethodDefinition, bool> skip,
                                                                       Func<MethodDefinition, bool> stopAfter)
        {
            var called = calls[methDef] = methodsCalledBy(methDef).Distinct().ToList();
            foreach (var calledMeth in called)
            {
                if (!calls.ContainsKey(calledMeth) && !skip(calledMeth))
                {
                    var newStack = fullStack.Append(calledMeth).ToList();
                    yield return newStack;
                    if (!stopAfter(calledMeth))
                    {
                        // yield from, please!
                        foreach (var subcall in VisitMethodDefinition(newStack, calledMeth, calls, skip, stopAfter))
                        {
                            yield return subcall;
                        }
                    }
                }
            }
        }

        private static IEnumerable<MethodDefinition> methodsCalledBy(MethodDefinition methDef)
            => GetCallsBy(methDef).Select(instr => instr.Operand as MethodDefinition
                                                   ?? GetSetterDef(instr.Operand as MethodReference))
                                  .OfType<MethodDefinition>();

        protected static IEnumerable<Instruction> GetCallsBy(MethodDefinition methDef)
            => methDef.Body
                      ?.Instructions
                       .Where(instr => callOpCodes.Contains(instr.OpCode.Name))
                      ?? Enumerable.Empty<Instruction>();

        // Property setters are virtual and have references instead of definitions
        private static MethodDefinition? GetSetterDef(MethodReference? mr)
            => (mr?.Name.StartsWith("set_") ?? false) ? mr.Resolve()
                                                      : null;

        protected static IEnumerable<TypeDefinition> GetAllNestedTypes(TypeDefinition td)
            => Enumerable.Repeat(td, 1)
                         .Concat(td.NestedTypes.SelectMany(GetAllNestedTypes));

        protected static IEnumerable<MethodCall> FindStartedTasks(MethodDefinition md)
            => StartNewCalls(md).SelectMany(sn =>
                   sn.Operand is MethodReference snMethod
                   && FindStartNewArgument(sn) is MethodDefinition taskArg
                       ? Enumerable.Repeat(new MethodCall() { md, snMethod.Resolve(), taskArg, }, 1)
                       : Enumerable.Empty<MethodCall>());

        private static IEnumerable<Instruction> StartNewCalls(MethodDefinition md)
            => md.Body?.Instructions.Where(instr => callOpCodes.Contains(instr.OpCode.Name)
                                                    && instr.Operand is MethodReference mr
                                                    && isStartNew(mr))
                      ?? Enumerable.Empty<Instruction>();

        private static bool isStartNew(MethodReference mr)
            => mr is
               {
                   DeclaringType: { Namespace: "System.Threading.Tasks", Name: "TaskFactory" },
                   Name:          "StartNew",
               }
               or
               {
                   DeclaringType: { Namespace: "System.Threading.Tasks", Name: "Task" },
                   Name:          "Run",
               };

        private static MethodDefinition? FindStartNewArgument(Instruction instr)
            => FindFuncArguments(instr).FirstOrDefault();

        protected static IEnumerable<MethodCall> FindDebouncedTasks(MethodDefinition md)
            => DebounceCalls(md).SelectMany(db =>
                   db.Operand is MethodReference dbMethod
                       ? FindDebounceArguments(db)
                             .Select(dbArg => new MethodCall() { md, dbMethod.Resolve(), dbArg, })
                       : Enumerable.Empty<MethodCall>());

        private static IEnumerable<Instruction> DebounceCalls(MethodDefinition md)
            => md.Body?.Instructions.Where(instr => callOpCodes.Contains(instr.OpCode.Name)
                                                    && instr.Operand is MethodReference mr
                                                    && isDebounce(mr))
                      ?? Enumerable.Empty<Instruction>();

        private static bool isDebounce(MethodReference mr)
            => mr is
               {
                   DeclaringType: { Namespace: "CKAN.GUI", Name: "Util" },
                   Name:          "Debounce",
               };

        private static IEnumerable<MethodDefinition> FindDebounceArguments(Instruction instr)
            => FindFuncArguments(instr).Take(4);

        private static IEnumerable<MethodDefinition> FindFuncArguments(Instruction instr)
            => instr.TraverseNodes(i => i.Previous)
                    .Where(i => i.OpCode.Name == "ldftn")
                    .Select(i => i.Operand)
                    .OfType<MethodDefinition>();

        private static readonly HashSet<string> callOpCodes = new HashSet<string>
        {
            // Constructors
            "newobj",

            // Normal function calls
            "call",

            // Virtual function calls (includes property setters)
            "callvirt",
        };
    }
}
