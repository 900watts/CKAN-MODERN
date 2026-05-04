using System;
using System.Linq;

using Newtonsoft.Json.Linq;
using NUnit.Framework;
using Moq;

using CKAN.NetKAN.Model;
using CKAN.NetKAN.Sources.Gitea;
using CKAN.NetKAN.Transformers;
using CKAN.Versioning;

namespace Tests.NetKAN.Transformers
{
    [TestFixture]
    public sealed class GiteaTransformerTests
    {
        [Test]
        public void Transform_TestProject_Works()
        {
            // Arrange
            var api      = new Mock<IGiteaApi>();
            api.Setup(a => a.GetRepo(It.IsAny<GiteaRef>()))
               .Returns(new GiteaRepo()
                        {
                            Name = "KSP-Conformal-Decals",
                        });
            api.Setup(a => a.GetReleases(It.IsAny<GiteaRef>()))
               .Returns(new GiteaRelease[]
                        {
                            new GiteaRelease()
                            {
                                Tag        = new ModuleVersion("v1.0"),
                                PreRelease = true,
                                Assets     = new GiteaReleaseAsset[]
                                {
                                    new GiteaReleaseAsset()
                                    {
                                        Name     = "ConformalDecals.zip",
                                        Download = new Uri("https://downloadfrom.com/mod.zip"),
                                    },
                                },
                            },
                        });
            var sut      = new GiteaTransformer(api.Object);
            var metadata = new Metadata(new JObject()
            {
                {
                    "$kref",
                    "#/ckan/gitea/git.offworldcolonies.nexus/drewcassidy/KSP-Conformal-Decals"
                },
            });
            var opts = new TransformOptions(1, 0, null, null, false, null);

            // Act
            var result = sut.Transform(metadata, opts).First();

            // Assert
            Assert.AreEqual("v1.0", result.Version?.ToString());
            Assert.IsTrue(result.Prerelease);
            CollectionAssert.AreEqual(new Uri[]
                                      {
                                          new Uri("https://downloadfrom.com/mod.zip"),
                                      },
                                      result.Download);
        }
    }
}
