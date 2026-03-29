using System;

using NUnit.Framework;
using Moq;

using CKAN.NetKAN.Model;
using CKAN.NetKAN.Services;
using CKAN.NetKAN.Sources.Gitea;

namespace Tests.NetKAN.Sources.Gitea
{
    [TestFixture]
    public sealed class GiteaApiTests
    {
        [Test]
        public void GetRepo_TestProject_Works()
        {
            // Arrange
            var http = new Mock<IHttpService>();
            http.Setup(h => h.DownloadText(It.IsAny<Uri>(),
                                           It.IsAny<string?>(),
                                           It.IsAny<string?>()))
                .Returns(@"{
                    ""name"": ""KSP-Conformal-Decals"",
                    ""description"": ""Conformal Decals for KSP"",
                    ""website"": ""https://forum.kerbalspaceprogram.com/index.php?/topic/194802-*"",
                    ""has_issues"": true,
                    ""has_wiki"": true,
                    ""html_url"": ""https://git.offworldcolonies.nexus/drewcassidy/KSP-Conformal-Decals"",
                    ""owner"": {
                        ""login"": ""drewcassidy""
                    }
                }");
            var sut       = new GiteaApi(http.Object);
            var reference = new GiteaRef(new RemoteRef("#/ckan/gitea/git.offworldcolonies.nexus/drewcassidy/KSP-Conformal-Decals"));

            // Act
            var result = sut.GetRepo(reference);

            // Assert
            Assert.AreEqual("KSP-Conformal-Decals", result?.Name);
            Assert.AreEqual("https://git.offworldcolonies.nexus/drewcassidy/KSP-Conformal-Decals", result?.HtmlUrl);
            Assert.AreEqual("https://forum.kerbalspaceprogram.com/index.php?/topic/194802-*", result?.Website);
            Assert.AreEqual("Conformal Decals for KSP", result?.Description);
            Assert.AreEqual("drewcassidy", result?.Owner?.Login);
        }

        [Test]
        public void GetReleases_TestProject_Works()
        {
            // Arrange
            var http = new Mock<IHttpService>();
            http.Setup(h => h.DownloadText(It.IsAny<Uri>(),
                                           It.IsAny<string?>(),
                                           It.IsAny<string?>()))
                .Returns(@"[
                    {
                        ""tag_name"": ""v1.0"",
                        ""assets"": [
                            {
                                ""name"": ""mod.zip"",
                                ""browser_download_url"": ""https://downloadfrom.com/mod.zip"",
                            }
                        ]
                    }
                ]");
            var sut       = new GiteaApi(http.Object);
            var reference = new GiteaRef(new RemoteRef("#/ckan/gitea/git.offworldcolonies.nexus/drewcassidy/KSP-Conformal-Decals"));

            // Act
            var result = sut.GetReleases(reference);

            // Assert
            Assert.AreEqual(1, result.Length);
            Assert.AreEqual("v1.0", result[0].Tag?.ToString());
            Assert.AreEqual(1, result[0]?.Assets?.Length);
            Assert.AreEqual("mod.zip", result[0]?.Assets?[0].Name);
            Assert.AreEqual(new Uri("https://downloadfrom.com/mod.zip"),
                            result[0]?.Assets?[0].Download);
        }
    }
}
